/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "path";
import type { Id64String} from "@itwin/core-bentley";
import { DbResult, Id64, Logger, LogLevel } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import type { ECSqlStatement, IModelDb} from "@itwin/core-backend";
import { ExternalSource, ExternalSourceAspect, IModelHost, IModelHostConfiguration, IModelJsFs, PhysicalPartition, RepositoryLink, Subject, SynchronizationConfigLink, SynchronizationConfigSpecifiesRootSources } from "@itwin/core-backend";
import type { RectangleTile, SmallSquareTile } from "./TestConnector/TestConnectorElements";
import { CodeSpecs } from "./TestConnector/TestConnectorElements";
import { ModelNames } from "./TestConnector/TestConnector";
import { KnownTestLocations } from "./KnownTestLocations";
import type { JobArgs } from "../src/Args";
import * as fs from "fs";
import type { DeletionDetectionParams } from "../src/Synchronizer";
import { LoggerCategories } from "../src/LoggerCategory";

export function setupLogging() {
  Logger.initializeToConsole();
  configLogging();
}

export function setupLoggingWithAPIMRateTrap() {

  const resetIntervalId = setInterval(() => 0, 60 * 1000);

  // Logger.initialize(
  //   (category: string, message: string, getMetaData?: () => any): void => console.log(`Error   |${category}| ${message}${formatMetaData(getMetaData)}`),
  //   (category: string, message: string, getMetaData?: () => any): void => console.log(`Warning |${category}| ${message}${formatMetaData(getMetaData)}`),
  //   logInfo,
  //   (category: string, message: string, getMetaData?: () => any): void => console.log(`Trace   |${category}| ${message}${formatMetaData(getMetaData)}`),
  // );

  Logger.initialize();

  configLogging();

  return () => clearInterval(resetIntervalId);
}

/* eslint-disable no-console */

/** Loads the provided `.env` file into process.env */
function loadEnv(envFile: string) {
  if (!fs.existsSync(envFile))
    return;

  const dotenv = require("dotenv"); // eslint-disable-line @typescript-eslint/no-var-requires
  const dotenvExpand = require("dotenv-expand"); // eslint-disable-line @typescript-eslint/no-var-requires
  const envResult = dotenv.config({ path: envFile });

  if (envResult.error) {
    throw envResult.error;
  }

  dotenvExpand(envResult);
}

export async function startBackend(): Promise<void> {
  loadEnv(path.join(__dirname, "..", ".env"));
  const config = new IModelHostConfiguration();
  // config.concurrentQuery.concurrent = 4; // for test restrict this to two threads. Making closing connection faster
  // NEEDSWORK how do we do this in imodel js V3.x?
  config.cacheDir = KnownTestLocations.outputDir;
  await IModelHost.startup(config);
}

export async function shutdownBackend() {
  await IModelHost.shutdown();
}

function configLogging() {
  const loggingConfigFile: string = process.env.imjs_test_logging_config || path.join(__dirname, "logging.config.json");

  if (IModelJsFs.existsSync(loggingConfigFile)) {
    // eslint-disable-next-line no-console
    console.log(`Setting up logging levels from ${loggingConfigFile}`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(loggingConfigFile);
    Logger.configureLevels(config);
  } else {
    // eslint-disable-next-line no-console
    console.log(`You can set the environment variable imjs_test_logging_config to point to a logging configuration json file.`);
    Logger.setLevelDefault(LogLevel.Warning);
  }
}

export function getCount(imodel: IModelDb, className: string) {
  let count = 0;
  imodel.withPreparedStatement(`SELECT count(*) AS [count] FROM ${className}`, (stmt: ECSqlStatement) => {
    assert.equal(DbResult.BE_SQLITE_ROW, stmt.step());
    const row = stmt.getRow();
    count = row.count;
  });
  return count;
}

function getDDParamsFromEnv(): DeletionDetectionParams {
  const ddp = {fileBased: true, scopeToPartition : false};

  if ("testConnector_channelBasedDD" in process.env) {
    ddp.fileBased = false;
  } else {
    if ("testConnector_scopeToPartition" in process.env) {
      ddp.scopeToPartition = true;
    }
  }
  return ddp;
}

function checkClassInstanceCount (expected : number, imodel: IModelDb, className: string) {
 Logger.logInfo (LoggerCategories.Framework, `Checking for ${expected} instance of class ${className}.`);
 assert.equal(expected, getCount(imodel, className));
 return;
}

export function verifyIModel(imodel: IModelDb, jobArgs: JobArgs, isUpdate: boolean = false, ddp?: DeletionDetectionParams) {
  // Confirm the schema was imported simply by trying to get the meta data for one of the classes.
  assert.isDefined(imodel.getMetaData("TestConnector:TestConnectorGroup"));
  checkClassInstanceCount(1, imodel, "BisCore:RepositoryLink");
  checkClassInstanceCount(1, imodel, "BisCore:PhysicalModel");
  checkClassInstanceCount(1, imodel, "TestConnector:TestConnectorGroupModel");
  checkClassInstanceCount(8, imodel, "BisCore:GeometryPart");
  checkClassInstanceCount(1, imodel, "BisCore:SpatialCategory");
  checkClassInstanceCount(2, imodel, "BisCore:RenderMaterial");
  checkClassInstanceCount(2, imodel, "TestConnector:TestConnectorGroup");
  checkClassInstanceCount(41, imodel, "TestConnector:TestConnectorPhysicalElement");
  checkClassInstanceCount(6, imodel, "TestConnector:EquilateralTriangleTile");
  checkClassInstanceCount(8, imodel, "TestConnector:IsoscelesTriangleTile");
  checkClassInstanceCount(isUpdate ? 7 : 8, imodel, "TestConnector:LargeSquareTile");
  checkClassInstanceCount(isUpdate ? 2 : 1, imodel, "TestConnector:RectangleTile");
  checkClassInstanceCount(10, imodel, "TestConnector:RightTriangleTile");
  checkClassInstanceCount(8, imodel, "TestConnector:SmallSquareTile");
  checkClassInstanceCount(1, imodel, SynchronizationConfigLink.classFullName);
  checkClassInstanceCount(1, imodel, SynchronizationConfigSpecifiesRootSources.classFullName);
  checkClassInstanceCount(1, imodel, ExternalSource.classFullName);

  assert.isTrue(imodel.codeSpecs.hasName(CodeSpecs.Group));
  const jobSubjectName = `TestConnector:${jobArgs.source}`;
  const subjectId: Id64String = imodel.elements.queryElementIdByCode(Subject.createCode(imodel, IModel.rootSubjectId, jobSubjectName))!;
  assert.isTrue(Id64.isValidId64(subjectId));
  if (ddp === undefined) {
    ddp = getDDParamsFromEnv ();
  }
  const physicalModelId = imodel.elements.queryElementIdByCode(PhysicalPartition.createCode(imodel, subjectId, ModelNames.Physical));
  const repositoryModelId = imodel.elements.queryElementIdByCode (RepositoryLink.createCode(imodel, IModel.repositoryModelId, jobArgs.source));
  const scopeId = (ddp.scopeToPartition ? physicalModelId: repositoryModelId);
  assert.isTrue(scopeId !== undefined);
  assert.isTrue(Id64.isValidId64(scopeId!));

  // Verify some elements
  if (!isUpdate) {
    const ids = ExternalSourceAspect.findAllBySource(imodel, scopeId!, "Tile", "e1aa3ec3-0c2e-4328-89d0-08e1b4d446c8");
    assert.isTrue(ids.length > 0);
    assert.isTrue(Id64.isValidId64(ids[0].aspectId));
    assert.isTrue(Id64.isValidId64(ids[0].elementId));
    const tile = imodel.elements.getElement<SmallSquareTile>(ids[0].elementId);
    assert.equal(tile.condition, "New");
  } else {
    // Modified element
    let ids = ExternalSourceAspect.findAllBySource(imodel, scopeId!, "Tile", "e1aa3ec3-0c2e-4328-89d0-08e1b4d446c8");
    assert.isTrue(ids.length > 0);
    assert.isTrue(Id64.isValidId64(ids[0].aspectId));
    assert.isTrue(Id64.isValidId64(ids[0].elementId));
    let tile = imodel.elements.getElement<SmallSquareTile>(ids[0].elementId);
    assert.equal(tile.condition, "Scratched");

    // New element
    ids = ExternalSourceAspect.findAllBySource(imodel, scopeId!, "Tile", "5b51a06f-4026-4d0d-9674-d8428b118e9a");
    assert.isTrue(ids.length > 0);
    assert.isTrue(Id64.isValidId64(ids[0].aspectId));
    assert.isTrue(Id64.isValidId64(ids[0].elementId));
    tile = imodel.elements.getElement<RectangleTile>(ids[0].elementId);
    assert.equal(tile.placement.origin.x, 1.0);
    assert.equal(tile.placement.origin.y, 2.0);
  }
}

export function verifyRegPolyModel(imodel: IModelDb, jobArgs: JobArgs /*, isUpdate: boolean = false, ddp?: DeletionDetectionParams*/) {
  // Confirm the schema was imported simply by trying to get the meta data for one of the classes.
  assert.isDefined(imodel.getMetaData("TestConnector:TestConnectorGroup"));
  checkClassInstanceCount(1, imodel, "BisCore:RepositoryLink");
  checkClassInstanceCount(1, imodel, "BisCore:PhysicalModel");
  checkClassInstanceCount(1, imodel, "TestConnector:TestConnectorGroupModel");
  checkClassInstanceCount(11, imodel, "BisCore:GeometryPart");
  checkClassInstanceCount(1, imodel, "BisCore:SpatialCategory");
  //checkClassInstanceCount(2, imodel, "BisCore:RenderMaterial");
  checkClassInstanceCount(2, imodel, "TestConnector:TestConnectorGroup");
  //checkClassInstanceCount(41, imodel, "TestConnector:TestConnectorPhysicalElement");
  checkClassInstanceCount(3, imodel, "TestConnector:HexagonTile");
  checkClassInstanceCount(3, imodel, "TestConnector:PentagonTile");
  checkClassInstanceCount(3, imodel, "TestConnector:OctagonTile");
  checkClassInstanceCount(1, imodel, SynchronizationConfigLink.classFullName);
  checkClassInstanceCount(1, imodel, SynchronizationConfigSpecifiesRootSources.classFullName);
  checkClassInstanceCount(1, imodel, ExternalSource.classFullName);

  assert.isTrue(imodel.codeSpecs.hasName(CodeSpecs.Group));
  const jobSubjectName = `TestConnector:${jobArgs.source}`;
  const subjectId: Id64String = imodel.elements.queryElementIdByCode(Subject.createCode(imodel, IModel.rootSubjectId, jobSubjectName))!;
  assert.isTrue(Id64.isValidId64(subjectId));
  /*
  if (ddp === undefined) {
    ddp = getDDParamsFromEnv ();
  }
  const physicalModelId = imodel.elements.queryElementIdByCode(PhysicalPartition.createCode(imodel, subjectId, ModelNames.Physical));
  const repositoryModelId = imodel.elements.queryElementIdByCode (RepositoryLink.createCode(imodel, IModel.repositoryModelId, jobArgs.source));
  const scopeId = (ddp.scopeToPartition ? physicalModelId: repositoryModelId);
  assert.isTrue(scopeId !== undefined);
  assert.isTrue(Id64.isValidId64(scopeId!));

  // Verify some elements
  if (!isUpdate) {
    const ids = ExternalSourceAspect.findAllBySource(imodel, scopeId!, "Tile", "e1aa3ec3-0c2e-4328-89d0-08e1b4d446c8");
    assert.isTrue(ids.length > 0);
    assert.isTrue(Id64.isValidId64(ids[0].aspectId));
    assert.isTrue(Id64.isValidId64(ids[0].elementId));
    const tile = imodel.elements.getElement<SmallSquareTile>(ids[0].elementId);
    assert.equal(tile.condition, "New");
  } else {
    // Modified element
    let ids = ExternalSourceAspect.findAllBySource(imodel, scopeId!, "Tile", "e1aa3ec3-0c2e-4328-89d0-08e1b4d446c8");
    assert.isTrue(ids.length > 0);
    assert.isTrue(Id64.isValidId64(ids[0].aspectId));
    assert.isTrue(Id64.isValidId64(ids[0].elementId));
    let tile = imodel.elements.getElement<SmallSquareTile>(ids[0].elementId);
    assert.equal(tile.condition, "Scratched");

    // New element
    ids = ExternalSourceAspect.findAllBySource(imodel, scopeId!, "Tile", "5b51a06f-4026-4d0d-9674-d8428b118e9a");
    assert.isTrue(ids.length > 0);
    assert.isTrue(Id64.isValidId64(ids[0].aspectId));
    assert.isTrue(Id64.isValidId64(ids[0].elementId));
    tile = imodel.elements.getElement<RectangleTile>(ids[0].elementId);
    assert.equal(tile.placement.origin.x, 1.0);
    assert.equal(tile.placement.origin.y, 2.0);
  }
  */
}

