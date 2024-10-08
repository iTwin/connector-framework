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
import { SyncError } from "../../src/SyncErrors";
import { SyncErrors } from "../../src/iModelConnectorErrors";
import SEConnectorPhases = SyncErrors.ConnectorPhases;
import SESystem = SyncErrors.System;

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
    const status = await runner.run(failConnector);
    expect(status).eq(BentleyStatus.ERROR);
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

  it("Should create properly formated syncerr.json files", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const connector = await require(`..\\${testConnector}`).default.create();

    // try several calls to reportError
    const dummyStr: string = "dummy";
    const dummyBool: boolean = false;
    // w kblink urls
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "connector", "acquire_briefcase", dummyStr, dummyBool, "UserNotAuthenticated");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "connector", "acquire_briefcase", "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098401", "dummy", "dummy", false, "UserNotAuthenticated");
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "connector", "schema", dummyStr, dummyBool, "protectedFile");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "connector", "schema", "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098414", "dummy", "dummy", false, "protectedFile");
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "connector", "file_format", dummyStr, dummyBool, "rootModelNotSpatial");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "connector", "file_format", "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#RootNotSpatial", "dummy", "dummy", false, "rootModelNotSpatial");
    // w kblink empty strings e.g. ""
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "connector", "internal_server_error", dummyStr, dummyBool, "ConnectorPoolNotFound");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "connector", "internal_server_error", "", "dummy", "dummy", false, "ConnectorPoolNotFound");
    // w no kblink property
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "connector", "unmap", dummyStr, dummyBool, "legacyV8SchemaError");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "connector", "unmap", "", "dummy", "dummy", false, "legacyV8SchemaError");
    // for completeness, try all the system types other than connector
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "edge_orchestrator", undefined, dummyStr, dummyBool, "OutOfMemory");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "edge_orchestrator", "Unknown", "", "dummy", "dummy", false, "OutOfMemory");
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "cloud_orchestrator", "preprocessor", dummyStr, dummyBool, "UnsupportedFile");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "cloud_orchestrator", "preprocessor", "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098410", "dummy", "dummy", false, "UnsupportedFile");
    connector.reportError(KnownTestLocations.outputDir, dummyStr, "cloud_orchestrator", "connector_initialization", dummyStr, dummyBool, "CanNotOpenFile");
    utils.verifySyncerrProps(KnownTestLocations.outputDir, "cloud_orchestrator", "connector_initialization", "", "dummy", "dummy", false, "CanNotOpenFile");
  });

  it("Should create properly formated syncerr.json using new method", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const connector = await require(`..\\${testConnector}`).default.create();
    connector.structuredErrorDir = KnownTestLocations.outputDir;
    // use key - note we only need to set the key member all other members will be looked up
    const structuredError: SyncError = {
      descriptionKey: "UserNotAuthenticated",
    };

    connector.reportStructuredError(structuredError, SEConnectorPhases.AcquireBriefcase);

    // add the phase and system members to match enum that was passed to reportStructuredError above
    structuredError.system = SESystem.Connector.toString();
    structuredError.phase = SEConnectorPhases.AcquireBriefcase.toString();

    // now add the members to compare the structured error with what's read from syncerrs.json
    structuredError.description = "User is not authenticated.";
    structuredError.category = "ims_token_access";
    structuredError.kbArticleLink = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098401";
    structuredError.canUserFix = true;

    utils.verifySyncerr(KnownTestLocations.outputDir, structuredError);
    // use custom error - no key
    const customError: SyncError = {
      system: "connector",
      phase: "acquire_briefcase",
      description: "User is not authenticated.",
      category: "ims_token_access",
      kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098401",
      canUserFix: true,
    };

    connector.reportStructuredError(customError);
    utils.verifySyncerr(KnownTestLocations.outputDir, customError);

  });
});
