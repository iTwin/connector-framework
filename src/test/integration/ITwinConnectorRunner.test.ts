/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64String, Config, BentleyStatus, ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { AuthorizedBackendRequestContext, BriefcaseDb, BriefcaseManager, IModelJsFs } from "@bentley/imodeljs-backend";
import { AccessToken } from "@bentley/itwin-client";
import { getTestAccessToken } from "@bentley/oidc-signin-tool";
import { expect } from "chai";
import { ConnectorJobDefArgs, ConnectorRunner } from "../../ConnectorRunner";
import { ServerArgs } from "../../IModelHubUtils";
import { ConnectorTestUtils, TestIModelInfo } from "../ConnectorTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";
import * as fs from "fs";
import * as path from "path";

describe("iTwin Connector Fwk (#integration)", () => {
  let testProjectId: Id64String;
  let readWriteTestIModel: TestIModelInfo;
  let requestContext: AuthorizedBackendRequestContext;

  before(async () => {
    ConnectorTestUtils.setupLogging();
    ConnectorTestUtils.setupDebugLogLevels();
    await ConnectorTestUtils.startBackend();

    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    try {
      const clientCred = {
        clientId: process.env.test_client_id!,
        redirectUri: process.env.test_redirect_uri!,
        scope: process.env.test_scopes!,
      };
      const userCred = {
        email: process.env.test_user_name!,
        password: process.env.test_user_password!,
      };
      const token = await getTestAccessToken(clientCred, userCred, 102);
      requestContext = new AuthorizedBackendRequestContext(token);
    } catch (error) {
      Logger.logError("Error", `Failed with error: ${error}`);
    }

    Config.App.set("imjs_buddi_resolve_url_using_region", "102");
    testProjectId = process.env.test_project_id!;
    const imodelName = "tset";
    const targetIModelId = await HubUtility.recreateIModel(requestContext, testProjectId, imodelName);

    expect(undefined !== targetIModelId);
    readWriteTestIModel = await ConnectorTestUtils.getTestModelInfo(requestContext, testProjectId, imodelName);

    await HubUtility.purgeAcquiredBriefcases(requestContext, testProjectId, imodelName);
  });

  after(async () => {
    try {
      await HubUtility.purgeAcquiredBriefcasesById(requestContext, readWriteTestIModel.id, () => {});
    } catch (err) {}

    await ConnectorTestUtils.shutdownBackend();
  });

  async function runConnector(connectorJobDef: ConnectorJobDefArgs, serverArgs: ServerArgs, isUpdate: boolean = false) {
    const runner = new ConnectorRunner(connectorJobDef, serverArgs);
    const status = await runner.synchronize();
    expect(status === BentleyStatus.SUCCESS);
    const briefcases = BriefcaseManager.getCachedBriefcases(serverArgs.iModelId);
    const briefcaseEntry = briefcases[0];
    expect(briefcaseEntry !== undefined);

    const imodel = await BriefcaseDb.open(new ClientRequestContext(), { fileName: briefcases[0].fileName, readonly: true });
    ConnectorTestUtils.verifyIModel(imodel, connectorJobDef, isUpdate);
    imodel.close();
  }

  it("should download and perform updates", async () => {

    const connectorJobDef = new ConnectorJobDefArgs();
    const sourcePath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const targetPath = path.join(KnownTestLocations.assetsDir, "TestConnector_.json");
    IModelJsFs.copySync(sourcePath, targetPath, { overwrite: true });
    connectorJobDef.sourcePath = targetPath;
    connectorJobDef.connectorModule = "./test/integration/TestiTwinConnector.js";

    const serverArgs = new ServerArgs();  // TODO have an iModelBank version of this test
    serverArgs.contextId = testProjectId;
    serverArgs.iModelId = readWriteTestIModel.id;
    serverArgs.getToken = async (): Promise<AccessToken> => {
      return requestContext.accessToken;
    };

    await runConnector(connectorJobDef, serverArgs);
    await runConnector(connectorJobDef, serverArgs, false);

    // verify that a changed source changes the imodel
    IModelJsFs.copySync(path.join(KnownTestLocations.assetsDir, "TestConnector_v2.json"), targetPath, { overwrite: true });

    try { // must cause the updated source file to have a different modified time than the original, or the test bridge will this it's unchanged and ignore it.
      const time = new Date();
      fs.utimesSync(targetPath, time, time);
    } catch (err) {
      fs.closeSync(fs.openSync(targetPath, "w"));
    }

    await runConnector(connectorJobDef, serverArgs, true);

    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
  });
});
