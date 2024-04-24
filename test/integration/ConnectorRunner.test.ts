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
import { ConnectorRunner } from "../../src/ConnectorRunner";
import type { HubArgsProps} from "../../src/Args";
import { HubArgs, JobArgs } from "../../src/Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";

describe("iTwin Connector Fwk (#integration)", () => {

  let testProjectId: Id64String;
  let testIModelId: Id64String| undefined;
  let updateIModelId: Id64String | undefined;
  let unmapIModelId: Id64String | undefined;
  let testClientConfig: TestBrowserAuthorizationClientConfiguration;
  let token: AccessToken| undefined;

  const testConnector = path.join("..", "lib", "test", "TestConnector", "TestConnector.js");

  before(async () => {
    await utils.startBackend();
    utils.setupLogging();
    const iModelClient = new IModelsClient({ api: { baseUrl: `https://${process.env.imjs_url_prefix ?? ""}api.bentley.com/imodels`}});
    IModelHost.setHubAccess(new BackendIModelsAccess(iModelClient));

    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    testClientConfig = {
      clientId: process.env.test_client_id!,
      redirectUri: process.env.test_redirect_uri!,
      scope: process.env.test_scopes!,
      authority: `https://${process.env.imjs_url_prefix}ims.bentley.com`
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
    let newImodelName = process.env.test_new_imodel_name ? process.env.test_new_imodel_name : "ConnectorFramework";
    let updateImodelName = process.env.test_existing_imodel_name? process.env.test_existing_imodel_name: newImodelName + "Update";


    updateIModelId = await IModelHost.hubAccess.queryIModelByName({ accessToken: token, iTwinId: testProjectId, iModelName: updateImodelName });
    if (!updateIModelId) {
      updateIModelId = await IModelHost.hubAccess.createNewIModel({ iTwinId: testProjectId, iModelName: updateImodelName, accessToken: token });
    }

    testIModelId = await IModelHost.hubAccess.queryIModelByName({ accessToken: token, iTwinId: testProjectId, iModelName: newImodelName});
    if (!testIModelId) {
      testIModelId = await IModelHost.hubAccess.createNewIModel({ accessToken: token, iTwinId: testProjectId, iModelName: newImodelName });
    }

    // TODO: change hardcoded iModel name
    unmapIModelId = await IModelHost.hubAccess.queryIModelByName({ accessToken: token, iTwinId: testProjectId, iModelName: newImodelName + "Unmap"});
    if (!unmapIModelId) {
      unmapIModelId = await IModelHost.hubAccess.createNewIModel({ accessToken: token, iTwinId: testProjectId, iModelName: newImodelName + "Unmap" });
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
    await utils.shutdownBackend();
    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
  });

  async function runConnector(jobArgs: JobArgs, hubArgs: HubArgs, skipVerification?: boolean) {
    const runner = new ConnectorRunner(jobArgs, hubArgs);
    // __PUBLISH_EXTRACT_START__ ConnectorRunnerTest.run.example-code
    const status = await runner.run(testConnector);
    // __PUBLISH_EXTRACT_END_

    if (status !== BentleyStatus.SUCCESS)
      throw new Error();

    if (skipVerification)
      return;

    await verifyIModel(jobArgs, hubArgs);
  }

  async function verifyIModel(jobArgs: JobArgs, hubArgs: HubArgs) {
    let db;
    try {
      const briefcases = BriefcaseManager.getCachedBriefcases(hubArgs.iModelGuid);
      expect(briefcases && (briefcases.length > 0));
      const briefcaseEntry = briefcases[0];
      expect(briefcaseEntry !== undefined);
      db = await BriefcaseDb.open({ fileName: briefcases[0].fileName, readonly: true });
      utils.verifyIModel(db, jobArgs, false);
    } finally {
      db?.close();
    }
  }

  it("should download and perform updates on a new imodel", async () => {
    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
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
    // TODO: This test does not seem to operate on a fresh iModel; see before().

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
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

  it("should download and perform an unmap operation on an existing imodel", async () => {
    // TODO: This test does not seem to operate on a fresh iModel; see before().

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: unmapIModelId,
    } as HubArgsProps);

    hubArgs.clientConfig = testClientConfig;
    hubArgs.tokenCallback = async (): Promise<AccessToken> => {
      return token!;
    };

    // First run to add data
    await runConnector(jobArgs, hubArgs);

    // Second run to add another model
    jobArgs.source = path.join(KnownTestLocations.assetsDir, "TestConnector_v2.json");
    await runConnector(jobArgs, hubArgs, true);

    // Deletes second model
    jobArgs.shouldUnmapSource = true;
    await runConnector(jobArgs, hubArgs, true);

    // Verify that second model is deleted
    jobArgs.source = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    await verifyIModel(jobArgs, hubArgs);

    // cleanup
    await IModelHost.hubAccess.deleteIModel({accessToken: token, iTwinId: testProjectId, iModelId: unmapIModelId!});
  });
});
