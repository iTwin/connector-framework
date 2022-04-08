/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, BentleyStatus, Id64String, Logger } from "@itwin/core-bentley";
import { BriefcaseDb, BriefcaseManager, IModelHost, IModelJsFs } from "@itwin/core-backend";
import { ElectronMainAuthorization } from "@itwin/electron-authorization/lib/cjs/ElectronMain";
import { getTestAccessToken, TestBrowserAuthorizationClientConfiguration, TestUtility } from "@itwin/oidc-signin-tool";
import { expect } from "chai";
import { ConnectorRunner } from "../../ConnectorRunner";
import { HubArgs, HubArgsProps, JobArgs } from "../../Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { HubUtility } from "../TestConnector/HubUtility";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";
import * as fs from "fs";

describe("iTwin Connector Fwk (#integration)", () => {

  let testProjectId: Id64String;
  let testIModelId: Id64String| undefined;
  let testClientConfig: TestBrowserAuthorizationClientConfiguration;
  let token: AccessToken| undefined;

  before(async () => {
    await utils.startBackend();
    utils.setupLogging();
    const iModelClient = new IModelsClient({ api: { baseUrl: `https://${process.env.IMJS_URL_PREFIX ?? ""}api.bentley.com/imodels`}});
    IModelHost.setHubAccess(new BackendIModelsAccess(iModelClient));

    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    testClientConfig = {
      clientId: process.env.test_client_id!,
      redirectUri: process.env.test_redirect_uri!,
      scope: process.env.test_scopes!,
    };
    const userCred = {
      email: process.env.test_user_name!,
      password: process.env.test_user_password!,
    };
    const client = await TestUtility.getAuthorizationClient(userCred, testClientConfig);
    token = await client.getAccessToken();
    if (!token) {
      throw new Error("Token not defined");
    }
    IModelHost.authorizationClient = client;
    testProjectId = process.env.test_project_id!;
    const imodelName = process.env.test_imodel_name!;
    
    const existingIModelId = await IModelHost.hubAccess.queryIModelByName({ accessToken: token, iTwinId: testProjectId, iModelName: imodelName });
    if (existingIModelId) {
      await IModelHost.hubAccess.deleteIModel({ iTwinId: testProjectId, iModelId: existingIModelId, accessToken: token });
    }
    testIModelId = await IModelHost.hubAccess.createNewIModel({ accessToken: token, iTwinId: testProjectId, iModelName: imodelName });
  });

  after(async () => {
    // await HubUtility.purgeAcquiredBriefcasesById(token!, testIModelId!, () => {});
    await utils.shutdownBackend();
  });

  async function runConnector(jobArgs: JobArgs, hubArgs: HubArgs) {
    const runner = new ConnectorRunner(jobArgs, hubArgs);
    const connectorFile = "./test/TestConnector/TestConnector.js";
    const status = await runner.run(connectorFile);
    if (status !== BentleyStatus.SUCCESS)
      throw new Error();

    const briefcases = BriefcaseManager.getCachedBriefcases(hubArgs.iModelGuid);
    const briefcaseEntry = briefcases[0];
    expect(briefcaseEntry !== undefined);
    const db = await BriefcaseDb.open({ fileName: briefcases[0].fileName, readonly: true });
    utils.verifyIModel(db, jobArgs, false);
    db.close();
  }

  it("should download and perform updates", async () => {
    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: testIModelId,
    } as HubArgsProps);

    hubArgs.clientConfig = testClientConfig;
    hubArgs.tokenCallback = async (): Promise<AccessToken> => {
      return token!;
    };

    await runConnector(jobArgs, hubArgs);
    
    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
  });
});
