/* eslint-disable no-console */
import { ConnectorRunner } from "../../ConnectorRunner";
import { IModelHost } from "@bentley/imodeljs-backend";
import { BentleyStatus } from "@bentley/imodeljs-common";
import * as path from "path";

async function main() {
  await IModelHost.startup();

  const connectorFile = path.join(__dirname, "TestConnector.js");
  const argfile = path.join(process.cwd(), process.argv[2]);
  const runner = ConnectorRunner.fromFile(argfile);

  const runStatus = await runner.run(connectorFile);
  if (runStatus !== BentleyStatus.ERROR)
    throw new Error("ConnectorRunner failed");

  await IModelHost.shutdown();
}

main().catch((err) => console.log(err));

