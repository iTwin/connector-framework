/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "path";
import { DbResult, Id64, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { loadEnv } from "@bentley/config-loader";
import { IModel } from "@bentley/imodeljs-common";
import { ECSqlStatement, ExternalSourceAspect, IModelDb, IModelHost, IModelHostConfiguration, IModelJsFs, PhysicalPartition, Subject, SynchronizationConfigLink } from "@bentley/imodeljs-backend";
import { ITwinClientLoggerCategory } from "@bentley/itwin-client";
import { CodeSpecs, RectangleTile, SmallSquareTile } from "./integration/TestConnectorElements"; 
import { ModelNames } from "./integration/TestConnector"; 
import { KnownTestLocations } from "./KnownTestLocations"; 
import { JobArgs } from "../Args";

export function setupLogging() {
  Logger.initializeToConsole();
  configLogging();
}

export function setupLoggingWithAPIMRateTrap() {
  const formatMetaData = (getMetaData?: () => any) => {
    return getMetaData ? ` ${JSON.stringify(Logger.makeMetaData(getMetaData))}` : "";
  };

  let hubReqs = 0;
  const resetIntervalId = setInterval(() => hubReqs = 0, 60 * 1000);

  const logInfo = (category: string, message: string, getMetaData?: () => any) => {
    if (category === ITwinClientLoggerCategory.Request && message.includes("api.bentley.com"))
      hubReqs += 1;
    if (hubReqs > 100)
      throw new Error("Reached 100 requests per minute rate limit.");
    console.log(`Info    |${category}| ${hubReqs}| ${message}${formatMetaData(getMetaData)}`);
  }

  Logger.initialize(
    (category: string, message: string, getMetaData?: () => any): void => console.log(`Error   |${category}| ${message}${formatMetaData(getMetaData)}`),
    (category: string, message: string, getMetaData?: () => any): void => console.log(`Warning |${category}| ${message}${formatMetaData(getMetaData)}`),
    logInfo,
    (category: string, message: string, getMetaData?: () => any): void => console.log(`Trace   |${category}| ${message}${formatMetaData(getMetaData)}`),
  );

  configLogging();

  return () => clearInterval(resetIntervalId);
}

export async function startBackend(): Promise<void> {
  loadEnv(path.join(__dirname, "..", "..", ".env"));
  const config = new IModelHostConfiguration();
  config.concurrentQuery.concurrent = 4; // for test restrict this to two threads. Making closing connection faster
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
    Logger.setLevelDefault(LogLevel.Error);
  }
}

export function getCount(imodel: IModelDb, className: string) { 
  let count = 0; 
  imodel.withPreparedStatement(`SELECT count(*) AS [count] FROM ${className}`, (stmt: ECSqlStatement) => { assert.equal(DbResult.BE_SQLITE_ROW, stmt.step());
  const row = stmt.getRow(); count = row.count; });
  return count;
}


export function verifyIModel(imodel: IModelDb, jobArgs: JobArgs, isUpdate: boolean = false) {
  // Confirm the schema was imported simply by trying to get the meta data for one of the classes.
  assert.isDefined(imodel.getMetaData("TestConnector:TestConnectorGroup"));
  assert.equal(1, getCount(imodel, "BisCore:RepositoryLink"));
  assert.equal(1, getCount(imodel, "BisCore:PhysicalModel"));
  assert.equal(1, getCount(imodel, "TestConnector:TestConnectorGroupModel"));
  assert.equal(8, getCount(imodel, "BisCore:GeometryPart"));
  assert.equal(1, getCount(imodel, "BisCore:SpatialCategory"));
  assert.equal(2, getCount(imodel, "BisCore:RenderMaterial"));
  assert.equal(2, getCount(imodel, "TestConnector:TestConnectorGroup"));
  assert.equal(41, getCount(imodel, "TestConnector:TestConnectorPhysicalElement"));
  assert.equal(6, getCount(imodel, "TestConnector:EquilateralTriangleTile"));
  assert.equal(8, getCount(imodel, "TestConnector:IsoscelesTriangleTile"));
  assert.equal(isUpdate ? 7 : 8, getCount(imodel, "TestConnector:LargeSquareTile"));
  assert.equal(isUpdate ? 2 : 1, getCount(imodel, "TestConnector:RectangleTile"));
  assert.equal(10, getCount(imodel, "TestConnector:RightTriangleTile"));
  assert.equal(8, getCount(imodel, "TestConnector:SmallSquareTile"));
  assert.equal(1, getCount(imodel, SynchronizationConfigLink.classFullName));

  assert.isTrue(imodel.codeSpecs.hasName(CodeSpecs.Group));
  const jobSubjectName = jobArgs.source;
  const subjectId: Id64String = imodel.elements.queryElementIdByCode(Subject.createCode(imodel, IModel.rootSubjectId, jobSubjectName))!;
  assert.isTrue(Id64.isValidId64(subjectId));

  const physicalModelId = imodel.elements.queryElementIdByCode(PhysicalPartition.createCode(imodel, subjectId, ModelNames.Physical));
  assert.isTrue(physicalModelId !== undefined);
  assert.isTrue(Id64.isValidId64(physicalModelId!));

  // Verify some elements
  if (!isUpdate) {
    const ids = ExternalSourceAspect.findBySource(imodel, physicalModelId!, "Tile", "e1aa3ec3-0c2e-4328-89d0-08e1b4d446c8");
    assert.isTrue(Id64.isValidId64(ids.aspectId!));
    assert.isTrue(Id64.isValidId64(ids.elementId!));
    const tile = imodel.elements.getElement<SmallSquareTile>(ids.elementId!);
    assert.equal(tile.condition, "New");
  } else {
    // Modified element
    let ids = ExternalSourceAspect.findBySource(imodel, physicalModelId!, "Tile", "e1aa3ec3-0c2e-4328-89d0-08e1b4d446c8");
    assert.isTrue(Id64.isValidId64(ids.aspectId!));
    assert.isTrue(Id64.isValidId64(ids.elementId!));
    let tile = imodel.elements.getElement<SmallSquareTile>(ids.elementId!);
    assert.equal(tile.condition, "Scratched");

    // New element
    ids = ExternalSourceAspect.findBySource(imodel, physicalModelId!, "Tile", "5b51a06f-4026-4d0d-9674-d8428b118e9a");
    assert.isTrue(Id64.isValidId64(ids.aspectId!));
    assert.isTrue(Id64.isValidId64(ids.elementId!));
    tile = imodel.elements.getElement<RectangleTile>(ids.elementId!);
    assert.equal(tile.placement.origin.x, 1.0);
    assert.equal(tile.placement.origin.y, 2.0);
  }
}
