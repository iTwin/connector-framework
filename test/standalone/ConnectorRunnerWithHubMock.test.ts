/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BentleyStatus } from "@itwin/core-bentley";
import { BriefcaseDb, BriefcaseManager, IModelHost, IModelHostConfiguration, IModelJsFs } from "@itwin/core-backend";
import { ConnectorRunner } from "../../src/ConnectorRunner";
import { HubArgs, JobArgs } from "../../src/Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubMock2 } from "../HubMock2";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe.only("iTwin Connector Fwk (#standalone)", () => {

  let jobArgs: JobArgs;
  let hubArgs: HubArgs;

  const testConnector = path.join("..", "lib", "test", "TestConnector", "TestConnector.js");

  before(async () => {
    utils.setupLogging();

    if (IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
    else
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    jobArgs = new JobArgs({
      source: assetPath,
    });

    hubArgs = new HubArgs({
      projectGuid: "ef83bb55-b878-47f9-ba6e-1d6a55ff7212",
      iModelGuid: "28da54f7-cde5-4bac-a3a9-aca86ccdf962",
      maxLockRetries: 1,
      maxLockRetryWaitSeconds: 0.1,
    });
    (hubArgs as any).tokenCallback = async () => Promise.resolve("fake access token");

    const config = new IModelHostConfiguration();
    config.hubAccess = new BackendIModelsAccess();
    config.cacheDir = KnownTestLocations.outputDir;
    await IModelHost.startup(config);

    HubMock2.startup("Test", config.cacheDir);
    HubMock2.createOrOpenIModel({ iTwinId: hubArgs.projectGuid, iModelId: hubArgs.iModelGuid, iModelName: "Test" });
  });

  after(async () => {
    HubMock2.acquireLocksShouldFail = 0;
    HubMock2.shutdown();
    await IModelHost.shutdown();
    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
  });

  async function runConnector() {
    const runner = new ConnectorRunner(jobArgs, hubArgs);
    const status = await runner.run(testConnector);
    if (status !== BentleyStatus.SUCCESS)
      throw new Error();

    const briefcases = BriefcaseManager.getCachedBriefcases(hubArgs.iModelGuid);
    const briefcaseEntry = briefcases[0];
    expect(briefcaseEntry).is.not.undefined;
    const db = await BriefcaseDb.open({ fileName: briefcases[0].fileName, readonly: true });
    try {
      utils.verifyIModel(db, jobArgs, false);
    } finally {
      db.close();
    }
  }

  it("test connector with HubMock locks and briefcase manager", async () => {
    await runConnector();
  });

  it("retries should handle lock errors", async () => {
    HubMock2.acquireLocksShouldFail = 1;
    await runConnector();
  });

  it("too many lock retries should fail", async () => {
    HubMock2.acquireLocksShouldFail = 2;
    await expect(runConnector()).to.be.eventually.rejected;
  });
});
