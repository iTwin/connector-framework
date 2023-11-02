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
import * as fs from "fs";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { getCount } from "../ConnectorTestUtils";

chai.use(chaiAsPromised);
const expect = chai.expect;

async function openBriefcase(hubArgs: HubArgs) {
  const briefcases = BriefcaseManager.getCachedBriefcases(hubArgs.iModelGuid);
  const briefcaseEntry = briefcases[0];
  expect(briefcaseEntry).is.not.undefined;
  const db = await BriefcaseDb.open({ fileName: briefcases[0].fileName, readonly: true });
  return db;
}

describe("iTwin Connector Fwk (#standalone)", () => {

  let jobArgs: JobArgs;
  let hubArgs: HubArgs;

  const testConnector = path.join("..", "lib", "test", "TestConnector", "TestConnector.js");

  beforeEach(async () => {
    if (IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
    else
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    jobArgs = new JobArgs({
      source: assetPath,
      loggerConfigJSONFile: process.env.imjs_test_logging_config || path.join(__dirname, "..", "logging.config.json"),
    });

    hubArgs = new HubArgs({
      projectGuid: "ef83bb55-b878-47f9-ba6e-1d6a55ff7212",
      iModelGuid: "5331edd2-d164-4561-9102-e2ce0e67d264",
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

  afterEach(async () => {
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

    const db = await openBriefcase(hubArgs);
    try {
      utils.verifyIModel(db, jobArgs, false);
    } finally {
      db.close();
    }
  }

  it("test connector update - File Based Deletion Detection w Scoped to Partition", async () => {
    process.env.testConnector_scopeToPartition = "1"; // tell the connector to create XSAs scoped to partitions
    await runConnector();

    fs.utimesSync(jobArgs.source, new Date(), new Date()); // touch the input file, so that the connector will re-process it
    process.env.testConnector_skipTiles = "1"; // tell the connector to leave out some elements
    const runner = new ConnectorRunner(jobArgs, hubArgs);
    await runner.run(testConnector);

    delete process.env.testConnector_skipTiles;
    delete process.env.testConnector_scopeToPartition;

    const db = await openBriefcase(hubArgs);
    try {
      expect(0).not.eq(getCount(db, "TestConnector:TestConnectorGroup"));
      expect(0).eq(getCount(db, "TestConnector:TestConnectorPhysicalElement"));
    } finally {
      db.close();
    }
  });

  it("retries should handle lock errors", async () => {
    process.env.testConnector_scopeToPartition = "1";
    HubMock2.acquireLocksShouldFail = 1;
    await runConnector();
    delete process.env.testConnector_scopeToPartition;
  });

  it("too many lock retries should fail", async () => {
    HubMock2.acquireLocksShouldFail = 2;
    await expect(runConnector()).to.be.eventually.rejected;
  });
});
