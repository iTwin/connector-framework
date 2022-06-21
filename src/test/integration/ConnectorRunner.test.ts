/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AccessToken, Id64String} from "@itwin/core-bentley";
import { BentleyStatus } from "@itwin/core-bentley";
import { BriefcaseDb, BriefcaseManager, IModelHost, IModelJsFs } from "@itwin/core-backend";
import type { TestBrowserAuthorizationClientConfiguration} from "@itwin/oidc-signin-tool";
import { TestUtility} from "@itwin/oidc-signin-tool";
import { expect } from "chai";
import { ConnectorRunner } from "../../ConnectorRunner";
import TestConnector from "../TestConnector/TestConnector";
import type { HubArgsProps} from "../../Args";
import { HubArgs, JobArgs } from "../../Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";

describe("iTwin Connector Fwk (#integration)", () => {

  let testProjectId: Id64String;
  let testIModelId: Id64String| undefined;
  let updateIModelId: Id64String | undefined;
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
    const client = TestUtility.getAuthorizationClient(userCred, testClientConfig);
    token = await client.getAccessToken();

    if (!token) {
      throw new Error("Token not defined");
    }
    IModelHost.authorizationClient = client;
    testProjectId = process.env.test_project_id!;
    const updateImodelName = process.env.test_existing_imodel_name!;
    const newImodelName = process.env.test_new_imodel_name!;

    updateIModelId = await IModelHost.hubAccess.queryIModelByName({ accessToken: token, iTwinId: testProjectId, iModelName: updateImodelName });
    if (!updateIModelId) {
      updateIModelId = await IModelHost.hubAccess.createNewIModel({ iTwinId: testProjectId, iModelName: updateImodelName, accessToken: token });
    }
    testIModelId = await IModelHost.hubAccess.queryIModelByName({ accessToken: token, iTwinId: testProjectId, iModelName: newImodelName});
    if (!testIModelId) {
      testIModelId = await IModelHost.hubAccess.createNewIModel({ accessToken: token, iTwinId: testProjectId, iModelName: newImodelName });
    }
  });

  after(async () => {
    // updated method to clear briefcases for an imodel
    // let briefcases = await IModelHost.hubAccess.getMyBriefcaseIds({accessToken: token!, iModelId: testIModelId!});
    // briefcases.forEach(async b => {
    // await IModelHost.hubAccess.releaseBriefcase({briefcaseId: b, accessToken: token!, iModelId: testIModelId!});
    // });
    // const briefcases = await IModelHost.hubAccess.getMyBriefcaseIds({accessToken: token!, iModelId: updateIModelId!});
    // briefcases.forEach(async b => {
    //   await IModelHost.hubAccess.releaseBriefcase({briefcaseId: b, accessToken: token!, iModelId: updateIModelId!});
    // });
    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
    await utils.shutdownBackend();
  });

  async function runConnector(jobArgs: JobArgs, hubArgs: HubArgs) {
    const runner = new ConnectorRunner(jobArgs, hubArgs);
    const status = await runner.run(TestConnector);
    if (status !== BentleyStatus.SUCCESS)
      throw new Error();

    const briefcases = BriefcaseManager.getCachedBriefcases(hubArgs.iModelGuid);
    const briefcaseEntry = briefcases[0];
    expect(briefcaseEntry !== undefined);
    const db = await BriefcaseDb.open({ fileName: briefcases[0].fileName, readonly: true });
    utils.verifyIModel(db, jobArgs, false);
    db.close();
  }

  it("should download and perform updates on a new imodel", async () => {
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

    // cleanup
    await IModelHost.hubAccess.deleteIModel({accessToken: token, iTwinId: testProjectId, iModelId: testIModelId! });
  });

  it("should download and perform updates on an existing imodel", async () => {
    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: updateIModelId,
    } as HubArgsProps);

    hubArgs.clientConfig = testClientConfig;
    hubArgs.tokenCallback = async (): Promise<AccessToken> => {
      return token!;
    };

    await runConnector(jobArgs, hubArgs);

    // run sync again to test update

    await runConnector(jobArgs, hubArgs);

    // cleanup
    await IModelHost.hubAccess.deleteIModel({accessToken: token, iTwinId: testProjectId, iModelId: updateIModelId!});
  });
});
