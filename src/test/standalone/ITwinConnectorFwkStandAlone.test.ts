/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as fs from "fs";
import { IModelJsFs, SnapshotDb, SynchronizationConfigLink } from "@bentley/imodeljs-backend";
import { Logger, BentleyStatus } from "@bentley/bentleyjs-core";
import { KnownTestLocations } from "../KnownTestLocations";
import { ConnectorJobDefArgs, ConnectorRunner } from "../../ConnectorRunner";
import * as utils from "../ConnectorTestUtils";
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
    const connectorJobDef = new ConnectorJobDefArgs();
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    connectorJobDef.sourcePath = assetFile;
    connectorJobDef.connectorModule = "./test/integration/TestiTwinConnector.js";
    connectorJobDef.outputDir = KnownTestLocations.outputDir;
    connectorJobDef.isSnapshot = true;

    const runner = new ConnectorRunner(connectorJobDef);
    const fileName = `${path.basename(assetFile, path.extname(assetFile))}.bim`;
    const filePath = path.join(KnownTestLocations.outputDir, fileName);
    const status = await runner.synchronize();
    expect(status === BentleyStatus.SUCCESS);
    const imodel = SnapshotDb.openFile(filePath);
    utils.verifyIModel(imodel, connectorJobDef);

    imodel.close();
  });

  it("Should fail and create a error file", async () => {
    const connectorJobDef = new ConnectorJobDefArgs();
    connectorJobDef.sourcePath = undefined;
    connectorJobDef.connectorModule = "./test/integration/TestiTwinConnector.js";
    connectorJobDef.outputDir = KnownTestLocations.outputDir;
    connectorJobDef.isSnapshot = true;

    const runner = new ConnectorRunner(connectorJobDef);
    const fileName = `SyncError.json`;
    try{
      await runner.synchronize();
    } catch (error) {
      expect(error.message).to.eql("Source path is not defined");
    }
    expect(fs.statSync(path.join(KnownTestLocations.outputDir, fileName)).isFile());
  });

  it("Should fail and have synchConfigLink", async () => {
    const connectorJobDef = new ConnectorJobDefArgs();
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    connectorJobDef.sourcePath = assetFile;
    connectorJobDef.connectorModule = "./test/integration/FailTestiTwinConnector.js";
    connectorJobDef.outputDir = KnownTestLocations.outputDir;
    connectorJobDef.isSnapshot = true;
    connectorJobDef.synchConfigLink = "D:\\git\\connector-framework\\src\\test\\synchConfigTest.json";

    const runner = new ConnectorRunner(connectorJobDef);
    const fileName = `SyncError.json`;
    const status = await runner.synchronize();
    expect(status === BentleyStatus.ERROR);
    const filePath = path.join(KnownTestLocations.outputDir, `${path.basename(assetFile, path.extname(assetFile))}.bim`);
    const imodel = SnapshotDb.openFile(filePath);

    // utils.verifyIModel(imodel, connectorJobDef);
    assert.equal(1, utils.getCount(imodel, SynchronizationConfigLink.classFullName));
    expect(fs.statSync(path.join(KnownTestLocations.outputDir, fileName)).isFile());
  });
});
