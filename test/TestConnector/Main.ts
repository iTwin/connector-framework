/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */
import { ConnectorRunner } from "../../src/ConnectorRunner";
import { BentleyStatus } from "@itwin/core-bentley";
import * as path from "node:path";
import * as utils from "../ConnectorTestUtils";

async function main() {
  const testConnector = path.join(__dirname, "..", "..", "lib", "test", "TestConnector", "TestConnector.js");

  await utils.startBackend();

  const argfile = process.argv[2];
  const runner = ConnectorRunner.fromFile(argfile);

  const runStatus = await runner.run(testConnector);
  if (runStatus !== BentleyStatus.SUCCESS)
    throw new Error("ConnectorRunner failed");

  await utils.shutdownBackend();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

