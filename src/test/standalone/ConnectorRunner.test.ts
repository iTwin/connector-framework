/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";
import { BentleyStatus } from "@bentley/bentleyjs-core";
import { KnownTestLocations } from "../KnownTestLocations";
import { ConnectorRunner } from "../../ConnectorRunner";
import { JobArgs } from "../../Args";
import * as utils from "../ConnectorTestUtils";
import { expect } from "chai";
import * as path from "path";

describe("iTwin Connector Fwk StandAlone", () => {

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
      connectorFile: "./test/integration/TestConnector.js",
      stagingDir: KnownTestLocations.outputDir,
      dbType: "snapshot",
    });

    const runner = new ConnectorRunner(jobArgs);
    const dbpath = path.join(KnownTestLocations.outputDir, "TestConnector.bim");
    const status = await runner.synchronize();
    expect(status === BentleyStatus.SUCCESS);
    const db = SnapshotDb.openFile(dbpath);
    utils.verifyIModel(db, jobArgs);
    db.close();
  });

  /*
  it("Should fail and create a error file", async () => {
    const connectorJobDef = new JobArgs({
      source: undefined,
      connectorFile: "./test/integration/TestConnector.js",
      stagingDir: KnownTestLocations.outputDir,
      dbType: "snapshot",
    });

    const runner = new ConnectorRunner(connectorJobDef);
    const fileName = `SyncError.json`;
    try{
      await runner.synchronize();
    } catch (error) {
      expect(error.message).to.eql("Source path is not defined");
    }
    expect(fs.statSync(path.join(KnownTestLocations.outputDir, fileName)).isFile());
  });
  */
});
