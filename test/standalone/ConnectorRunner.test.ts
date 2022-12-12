/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelJsFs, SnapshotDb, StandaloneDb, SynchronizationConfigLink } from "@itwin/core-backend";
import { BentleyStatus } from "@itwin/core-bentley";
import { KnownTestLocations } from "../KnownTestLocations";
import { ConnectorRunner } from "../../src/ConnectorRunner";
import { SqliteIssueReporter } from "../../src/SqliteIssueReporter";
import { JobArgs } from "../../src/Args";
import * as utils from "../ConnectorTestUtils";
import { assert, expect } from "chai";
import * as path from "path";
import * as fs from "fs";

describe("iTwin Connector Fwk #standalone", () => {
  // Hypothesis: The JIT compiler from ts-node executes the connector runner in the test directory,
  // so we have to pull the compiled connectors relative to that location.
  const testConnector = path.join("..", "lib", "test", "TestConnector", "TestConnector.js");
  const failConnector = path.join("..", "lib", "test", "TestConnector", "FailTestITwinConnector.js");

  before(async () => {
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    await utils.startBackend();
    utils.setupLogging();
  });

  after(async () => {
    await utils.shutdownBackend();
  });

  it("Should parse args correctly", () => {
    const argfile = path.join(KnownTestLocations.assetsDir, "TestArgs.json");
    ConnectorRunner.fromFile(argfile); // throws
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
    const status = await runner.run(testConnector);
    expect(status).eq(BentleyStatus.SUCCESS);
    const db = SnapshotDb.openFile(dbpath);
    assert.equal(1, utils.getCount(db, SynchronizationConfigLink.classFullName));
    utils.verifyIModel(db, jobArgs);
    db.close();
  });

  it("Should perform updates on standalone iModel", async () => {
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetFile,
      stagingDir: KnownTestLocations.outputDir,
      dbType: "standalone",
    });

    const dbpath = path.join(KnownTestLocations.outputDir, "TestConnector.bim");

    let runner = new ConnectorRunner(jobArgs);
    let status = await runner.run(testConnector);
    let db = StandaloneDb.openFile(dbpath);

    expect(status).eq(BentleyStatus.SUCCESS);
    assert.equal(1, utils.getCount(db, SynchronizationConfigLink.classFullName));
    utils.verifyIModel(db, jobArgs);
    db.close();

    runner = new ConnectorRunner(jobArgs);
    status = await runner.run(testConnector);
    db = StandaloneDb.openFile(dbpath);

    expect(status).eq(BentleyStatus.SUCCESS);
    assert.equal(1, utils.getCount(db, SynchronizationConfigLink.classFullName));
    utils.verifyIModel(db, jobArgs);
    db.close();
  });

  function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
    if ("code" in (e as any)) return true;
    else return false;
  }

  it("Should fail and create a error file", async () => {
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetFile,
      stagingDir: KnownTestLocations.outputDir,
      dbType: "snapshot",
    });
    const fileName = `error.json`;
    const runner = new ConnectorRunner(jobArgs);
    const issueReporter = new SqliteIssueReporter("37c91053-2257-4976-bf7e-e567d5725fad", "5f7e765f-e3db-4f97-91c5-f344d664e066", "6dd55743-0c78-42ee-be50-558294a752c1", "TestBridge.json", KnownTestLocations.outputDir, undefined, assetFile);
    issueReporter.recordSourceFileInfo("TestBridge.json", "TestBridge", "TestBridge", "itemType", "dataSource", "state", "failureReason", true, 200, true);
    runner.issueReporter = issueReporter;
    try{
      await runner.run(failConnector);
    } catch (error) {
      if (isErrnoException(error))
        expect(error.message).to.eql("Connector has not been loaded.");
      else
        throw error;
    }
    const filePath = path.join(KnownTestLocations.outputDir, fileName);
    const badgersFile = runner.issueReporter.getReportPath();

    // disable for now
    expect(fs.statSync(filePath).isFile());
    expect(fs.statSync(badgersFile).isFile());
  });
  it("Should fail and have synchConfigLink", async () => {
    const assetFile = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetFile,
      stagingDir: KnownTestLocations.outputDir,
      dbType: "snapshot",
      synchConfigFile: path.join(__dirname, "..", "synchConfigTest.json"),
    });
    // const connectorJobDef = new ConnectorJobDefArgs();
    // connectorJobDef.sourcePath = assetFile;
    // connectorJobDef.connectorModule = ;
    // connectorJobDef.outputDir = KnownTestLocations.outputDir;
    // connectorJobDef.isSnapshot = true;
    // connectorJobDef.synchConfigLink = ;
    const runner = new ConnectorRunner(jobArgs);
    const fileName = `error.json`;
    const status = await runner.run(failConnector);
    expect(status).eq(BentleyStatus.ERROR);
    const filePath = path.join(KnownTestLocations.outputDir, `${path.basename(assetFile, path.extname(assetFile))}.bim`);
    const imodel = SnapshotDb.openFile(filePath);

    // utils.verifyIModel(imodel, connectorJobDef);
    assert.equal(1, utils.getCount(imodel, SynchronizationConfigLink.classFullName));
    expect(fs.statSync(path.join(KnownTestLocations.outputDir, fileName)).isFile());
  });
});
