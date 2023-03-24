/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// This is an example file that a typescript based connector could pass to an orchestrator that executes the connector.
// This particular example is assuming that the orchestrator being used is the file "app.ts" in the iModelBridgeAPIServer, link to that repo: https://dev.azure.com/bentleycs/iModelTechnologies/_git/iModelBridgeFramework?path=/iModelBridgeApiServer/src&version=GBmaster&_a=contents
// All configuration values coming from process would be setup in the dockerfile that creates your container, and anything coming from the "configuration" object conform to the JSON schema found here: https://dev.azure.com/bentleycs/beconnect/_git/iModelBridgeService?path=/assets/connectorconfig.json

import { ConnectorRunner } from "../src/ConnectorRunner";
import { JobArgs, HubArgs } from "../src/Args";
import * as fs from "fs";
import { IModelHost, IModelHostConfiguration } from "@itwin/core-backend"
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { get } from "request-promise-native";
import { BentleyStatus } from "@itwin/core-bentley";

async function runConnector() {
  console.log("Wrapper launched successfully");
  // These argument positions are based on what is used in the current orchestrator, if your execution strategy is not the same you will need to edit these to match how you are ordering your arguments
  let jsonFilePath: string;
  let connectorPath: string;
  if(process.argv[2] && process.argv[3]) {
    jsonFilePath = process.argv[3];
    connectorPath = process.argv[2];
  }
  else {
      console.log(`The arguments for file paths for the jsonConfiguration or the Connector are missing, check that the index for both are accurate.`);
      console.log(`process.argv[2] = ${process.argv[2]}(should be the path to your connector), process.argv[3] = ${process.argv[3]}(should be the path to your json configuration)`);
      process.exitCode = 1;
      return;
  }

  const configuration = require(jsonFilePath); //json should conform to schema found here: https://dev.azure.com/bentleycs/beconnect/_git/iModelBridgeService?path=/assets/connectorconfig.json
  const config = new IModelHostConfiguration();
  console.log(`parsed staging dir from configuration: ${configuration["connector/run"].stagingDirectory}`);
  config.cacheDir = configuration["connector/run"].stagingDirectory;
  const iModelClient = new IModelsClient({ api: { baseUrl: `https://${configuration["connector/run"].environment}-api.bentley.com/imodels`}});
  console.log(`imodelClient created with url https://${configuration["connector/run"].environment}-api.bentley.com/imodels\n`);
  await IModelHost.startup(config);
  IModelHost.setHubAccess(new BackendIModelsAccess(iModelClient));
  const testClientConfig = {
    clientId: process.env.clientId!,
    redirectUri: process.env.redirectUri!,
    scope: process.env.clientScope!
  };
  const jobArgs = new JobArgs({
    source: configuration["connector/input"].source,
    stagingDir: configuration["connector/run"].stagingDirectory
  });
  const hubArgs = new HubArgs({
    projectGuid: configuration["connector/iTwinContext"].iTwin,
    iModelGuid: configuration["connector/iTwinContext"].iModelId
  });
  let token: string = "";
  console.log(`token path: ${process.env["imbridge--server-token"]}`);
  const tokenPath = process.env["imbridge--server-token"];
  const tokenEndpoint = process.env.TOKEN_URI;
  if(tokenEndpoint){
    const requestOptions = {method: "GET", json: true, uri: tokenEndpoint,
      headers: {Authorization: process.env.AUTH_GUID},
    };
    console.log("getting token from token endpoint..");
    const response = await get(requestOptions);
    token = `Bearer ${response.access_token}`
  }
  else if(tokenPath) {
    console.log("getting token from path..");
    token = fs.readFileSync(tokenPath, "utf8");
  }
  hubArgs.clientConfig = testClientConfig;
  hubArgs.tokenCallback = async (): Promise<string> => {
    return token;
  };
  IModelHost.authorizationClient = {getAccessToken: async (): Promise<string> => { return token }};
  console.log(`Attempting to create connector runner, jobArgs source: ${jobArgs.source}, jobArgs stagingDir: ${jobArgs.stagingDir}, hubArgs projectGuid: ${hubArgs.projectGuid} hubArgs imodelguid: ${hubArgs.iModelGuid} `);
  const runner = new ConnectorRunner(jobArgs, hubArgs);
  console.log(`\nrunner created, about to call connectorRunner.run with path ${connectorPath}`);
  const status = await runner.run(connectorPath);
  if (status === BentleyStatus.ERROR)
    throw new Error("The connector encountered an error");
  console.log(status);
}

runConnector()
.then(() => {})
.catch(async err => {
  console.log(`error caught in runConnector(), error: ${err}`);
  process.exitCode = 1;
});