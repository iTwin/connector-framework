/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */
import { ConnectorRunner } from "../../src/ConnectorRunner";
import { BentleyStatus } from "@itwin/core-bentley";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";

async function main() {
  await utils.startBackend();

  const connectorFile = path.join(__dirname, "TestConnector.js");
  const argfile = process.argv[2];
  const runner = ConnectorRunner.fromFile(argfile);

  const runStatus = await runner.run(connectorFile);
  if (runStatus !== BentleyStatus.SUCCESS)
    throw new Error("ConnectorRunner failed");

  await utils.shutdownBackend();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

