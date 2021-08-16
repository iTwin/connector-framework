/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
import { IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";
import { Logger, BentleyStatus } from "@bentley/bentleyjs-core";
import { KnownTestLocations } from "../KnownTestLocations";
import { ConnectorJobDefArgs, ConnectorRunner } from "../../ConnectorRunner";
import { SqliteIssueReporter } from "../../SqliteIssueReporter";

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
    const issueReporter = new SqliteIssueReporter("37c91053-2257-4976-bf7e-e567d5725fad", "5f7e765f-e3db-4f97-91c5-f344d664e066", "6dd55743-0c78-42ee-be50-558294a752c1", "TestBridge.json", KnownTestLocations.outputDir, undefined, assetFile);
    issueReporter.recordSourceFileInfo("TestBridge.json", "TestBridge", "TestBridge", "itemType", "dataSource", "state", "failureReason", true, 200, true);
    runner.setIssueReporter(issueReporter);
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
});
