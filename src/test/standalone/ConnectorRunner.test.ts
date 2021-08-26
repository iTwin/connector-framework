/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";
import { BentleyStatus } from "@bentley/bentleyjs-core";
import { KnownTestLocations } from "../KnownTestLocations";
import { ConnectorRunner } from "../../ConnectorRunner";
import { SqliteIssueReporter } from "../../SqliteIssueReporter";
import { JobArgs } from "../../Args";
import * as utils from "../ConnectorTestUtils";
import { expect } from "chai";
import * as path from "path";
import * as fs from "fs";

describe("iTwin Connector Fwk StandAlone", () => {

  const connectorFile = "./test/integration/TestConnector.js";

  before(async () => {
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    await utils.startBackend();
    utils.setupLogging();
  });

  after(async () => {
    await utils.shutdownBackend();
  });

  it("Should create empty snapshot and synchronize source data", async () => {
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetFile,
      stagingDir: KnownTestLocations.outputDir,
      dbType: "snapshot",
    });

    const runner = new ConnectorRunner(jobArgs);
    const dbpath = path.join(KnownTestLocations.outputDir, "TestConnector.bim");
    const status = await runner.run(connectorFile);
    expect(status === BentleyStatus.SUCCESS);
    const db = SnapshotDb.openFile(dbpath);
    utils.verifyIModel(db, jobArgs);
    db.close();
  });

  it("Should fail and create a error file", async () => {
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: '',
      stagingDir: KnownTestLocations.outputDir,
      dbType: "snapshot",
    });

    const fileName = `SyncError.json`;
    try{
      const runner = new ConnectorRunner(jobArgs);
      const issueReporter = new SqliteIssueReporter("37c91053-2257-4976-bf7e-e567d5725fad", "5f7e765f-e3db-4f97-91c5-f344d664e066", "6dd55743-0c78-42ee-be50-558294a752c1", "TestBridge.json", KnownTestLocations.outputDir, undefined, assetFile);
      issueReporter.recordSourceFileInfo("TestBridge.json", "TestBridge", "TestBridge", "itemType", "dataSource", "state", "failureReason", true, 200, true);
      runner.issueReporter = issueReporter;
      await runner.run(connectorFile);
    } catch (error) {
      expect(error.message).to.eql("Invalid jobArgs");
    }

    // disable for now
    // expect(fs.statSync(path.join(KnownTestLocations.outputDir, fileName)).isFile());
  });
});
