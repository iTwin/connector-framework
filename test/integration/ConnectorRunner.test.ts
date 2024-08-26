/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, BentleyStatus, Id64String} from "@itwin/core-bentley";
import { BriefcaseDb, BriefcaseManager, IModelHost, IModelJsFs } from "@itwin/core-backend";
import { TestBrowserAuthorizationClientConfiguration, TestUtility} from "@itwin/oidc-signin-tool";
import { assert, expect } from "chai";
import { ConnectorRunner } from "../../src/ConnectorRunner";
import { HubArgs, HubArgsProps, JobArgs } from "../../src/Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";
import { TestIModelManager } from "./TestIModelManager";
import { ChangeSetGroup } from "../../src/ChangeSetGroup";
import {TestChangeSetGroup} from "./TestChangeSetGroup";

describe("iTwin Connector Fwk (#integration)", () => {

  let testProjectId: Id64String;
  const newImodelName = process.env.test_new_imodel_name ? process.env.test_new_imodel_name : "ConnectorFramework";
  const updateImodelName = process.env.test_existing_imodel_name? process.env.test_existing_imodel_name: `${newImodelName}Update`;
  const unmapImodelName = process.env.test_unmap_imodel_name? process.env.test_unmap_imodel_name: `${newImodelName}Unmap`;
  const changeSetGroupIModelName = process.env.test_change_set_group_name? process.env.test_change_set_group_name: `${newImodelName}ChangeSetGroup`;

  let testClientConfig: TestBrowserAuthorizationClientConfiguration;
  let token: AccessToken| undefined;
  let callbackUrl: string|undefined;

  let testConnector = path.join("..", "lib", "test", "TestConnector", "TestConnector.js");

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
      authority: `https://${process.env.imjs_url_prefix ?? ""}ims.bentley.com`,
    };

    callbackUrl = process.env.test_callbackUrl!;

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

  interface RunConnectorProps {
    jobArgs: JobArgs;
    hubArgs: HubArgs;
    skipVerification?: boolean;
    testSyncErr?: boolean;
  }

  async function runConnector(jobArgs: JobArgs, hubArgs: HubArgs, skipVerification?: boolean, testSyncErr?: boolean) {
    const runner = new ConnectorRunner(jobArgs, hubArgs);
    // __PUBLISH_EXTRACT_START__ ConnectorRunnerTest.run.cf-code
    const status = await runner.run(testConnector);
    // __PUBLISH_EXTRACT_END__

    if (status !== BentleyStatus.SUCCESS)
      throw new Error();

    if (!skipVerification) {
    // test authclient accessor in connector
      const tokenFrConnector =  await runner.connector.getAccessToken();
      expect(tokenFrConnector !== undefined && tokenFrConnector.length > 0);
      await verifyIModel(jobArgs, hubArgs);
    }

    if (testSyncErr) {
      const dir: string = jobArgs.stagingDir;
      const description: string ="Connector was unable to acquire required locks: Lock failure since User:   :  owns a lock in briefcase id: 37";
      const system: string = "connector";
      const phase: string = "pull_merge_push";
      const category: string = "imodel_access";
      const canUserFix: boolean = false;
      const descriptionKey: string = "LockError";
      const kbArticleLink: string = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098388";

      runner.connector.reportError(dir, description, system, phase, category, canUserFix, descriptionKey, kbArticleLink);

      const syncErrPath = path.join(dir, "SyncError.json");
      expect(IModelJsFs.existsSync(syncErrPath));
      const syncErrStr = IModelJsFs.readFileSync(syncErrPath).toString();
      const syncErr = JSON.parse(syncErrStr);
      expect(syncErr.version).to.equal("1.0");
      expect(syncErr.errors.length).to.equal(1);
      const err = syncErr.errors[0];
      expect(err.system).to.equal(system);
      expect(err.phase).to.equal(phase);
      expect(err.category).to.equal(category);
      expect(err.descriptionKey).to.equal(descriptionKey);
      expect(err.description).to.equal(description);
      expect(err.kbArticleLink).to.equal(kbArticleLink);
      expect(err.canUserFix).to.equal(canUserFix);

    }
    return;
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

  async function verifyChangeSetGroups(hubArgs: HubArgs) {

    const vcsgToken = await IModelHost.authorizationClient!.getAccessToken();
    let csgArr = await TestChangeSetGroup.getChangeSetGroups (vcsgToken, hubArgs.iModelGuid);
    assert.isDefined(csgArr);

    if (csgArr){
      assert.equal(csgArr.length, 1);
      assert.equal(csgArr[0].state, "completed");
      assert.equal(csgArr[0].description, "TestConnector");
    }

    // try some other methods
    const newCSG = await ChangeSetGroup.createChangeSetGroup (vcsgToken, "second", hubArgs.iModelGuid);
    assert.isDefined(newCSG);

    let id = newCSG?.id;

    const fromGet = await ChangeSetGroup.getChangeSetGroup (vcsgToken, hubArgs.iModelGuid, id!);

    assert.isDefined(fromGet);
    assert.equal(fromGet?.state, "inProgress");

    id = fromGet?.id;

    let closed = await ChangeSetGroup.closeChangeSetGroup (vcsgToken, hubArgs.iModelGuid, id!);
    assert.isDefined(closed);

    closed = await ChangeSetGroup.getChangeSetGroup (vcsgToken, hubArgs.iModelGuid, id!);
    assert.isDefined(closed);
    assert.equal(closed?.state, "completed");

    const thirdCSG = await ChangeSetGroup.createChangeSetGroup (vcsgToken, "third", hubArgs.iModelGuid);
    assert.isDefined(thirdCSG);
    assert.equal(thirdCSG?.state, "inProgress");

    id = thirdCSG?.id;
    closed = await ChangeSetGroup.closeChangeSetGroup (vcsgToken, hubArgs.iModelGuid, id!);
    assert.isDefined(closed);

    csgArr = await TestChangeSetGroup.getChangeSetGroups (vcsgToken, hubArgs.iModelGuid);
    assert.isDefined(csgArr);

    if (csgArr)
      assert.equal(csgArr.length, 3);
  }

  it("should download and perform updates on a new imodel", async () => {
    if (token === undefined)
      throw new Error (`Can't create a test iModel without a token!`);

    const iModelMgr: TestIModelManager = new TestIModelManager (testProjectId, newImodelName);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: await iModelMgr.createIModel(token),
    } as HubArgsProps);

    if (callbackUrl) {
      hubArgs.tokenCallbackUrl = callbackUrl;
    } else {
      hubArgs.clientConfig = testClientConfig;
      hubArgs.tokenCallback = async (): Promise<AccessToken> => {
        return token!;
      };
    }

    await runConnector(jobArgs, hubArgs);

    // cleanup
    await iModelMgr.deleteIModel(token);
  });

  it("should download and perform updates on an existing imodel", async () => {
    if (token === undefined)
      throw new Error (`Can't create a test iModel without a token!`);

    const iModelMgr: TestIModelManager = new TestIModelManager (testProjectId, updateImodelName);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: await iModelMgr.createIModel(token),
    } as HubArgsProps);

    if (callbackUrl) {
      hubArgs.tokenCallbackUrl = callbackUrl;
    } else {
      hubArgs.clientConfig = testClientConfig;
      hubArgs.tokenCallback = async (): Promise<AccessToken> => {
        return token!;
      };
    }

    await runConnector(jobArgs, hubArgs);

    // run sync again to test update
    await runConnector(jobArgs, hubArgs);

    // cleanup
    await iModelMgr.deleteIModel(token);
  });

  it ("should download and perform an unmap operation on an existing imodel", async () => {

    if (token === undefined)
      throw new Error (`Can't create a test iModel without a token!`);

    const iModelMgr: TestIModelManager = new TestIModelManager (testProjectId, unmapImodelName);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: await iModelMgr.createIModel(token),
    } as HubArgsProps);

    if (callbackUrl) {
      hubArgs.tokenCallbackUrl = callbackUrl;
    } else {
      hubArgs.clientConfig = testClientConfig;
      hubArgs.tokenCallback = async (): Promise<AccessToken> => {
        return token!;
      };
    }

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
    await iModelMgr.deleteIModel(token);
  });

  it("should create a change-set-group", async () => {

    if (token === undefined)
      throw new Error (`Can't create a test iModel without a token!`);

    const iModelMgr: TestIModelManager = new TestIModelManager (testProjectId, changeSetGroupIModelName);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: await iModelMgr.createIModel(token),
    } as HubArgsProps);

    if (callbackUrl) {
      hubArgs.tokenCallbackUrl = callbackUrl;
    } else {
      hubArgs.clientConfig = testClientConfig;
      hubArgs.tokenCallback = async (): Promise<AccessToken> => {
        return token!;
      };
    }

    testConnector = path.join("..", "lib", "test", "TestConnector", "ChangeSetGroupTestConnector.js");

    // First run to add data
    await runConnector(jobArgs, hubArgs);

    // Verify that change set group is created
    jobArgs.source = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    await verifyChangeSetGroups(hubArgs);

    await verifyIModel(jobArgs, hubArgs);
    // cleanup
    await iModelMgr.deleteIModel(token);
  });

  it ("should create a json object in syncerr.json w correct format", async () => {

    if (token === undefined)
      throw new Error (`Can't create a test iModel without a token!`);

    const iModelMgr: TestIModelManager = new TestIModelManager (testProjectId, changeSetGroupIModelName);

    const assetPath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const jobArgs = new JobArgs({
      source: assetPath,
      issuesDbDir: KnownTestLocations.outputDir,
      stagingDir: KnownTestLocations.outputDir,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: await iModelMgr.createIModel(token),
    } as HubArgsProps);

    if (callbackUrl) {
      hubArgs.tokenCallbackUrl = callbackUrl;
    } else {
      hubArgs.clientConfig = testClientConfig;
      hubArgs.tokenCallback = async (): Promise<AccessToken> => {
        return token!;
      };
    }

    testConnector = path.join("..", "lib", "test", "TestConnector", "TestConnector.js");

    // First run to add data
    await runConnector(jobArgs, hubArgs, false, true);

    jobArgs.source = path.join(KnownTestLocations.assetsDir, "TestConnector.json");

    await iModelMgr.deleteIModel(token);
  });

});

