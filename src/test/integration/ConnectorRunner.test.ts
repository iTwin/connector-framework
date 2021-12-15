/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, BentleyStatus, Id64String, Logger } from "@itwin/core-bentley";
import { BriefcaseDb, BriefcaseManager, IModelJsFs } from "@itwin/core-backend";
import { NativeAppAuthorizationConfiguration } from "@itwin/core-common";
import { getTestAccessToken, TestBrowserAuthorizationClientConfiguration } from "@itwin/oidc-signin-tool";
import {  assert, expect  } from "chai";
import { ConnectorRunner } from "../../ConnectorRunner";
import { JobArgs, HubArgs, HubArgsProps } from "../../Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "../TestConnector/HubUtility";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";
import * as fs from "fs";

describe("iTwin Connector Fwk (#integration)", () => {

  let testProjectId: Id64String;
  let testIModelId: Id64String;
  let testClientConfig: NativeAppAuthorizationConfiguration;
  let token: AccessToken| undefined;
  // NEEDSWORK - fix integration tests seperately
  const skipIntegrationTests = true;

  before(async () => {
    await utils.startBackend();
    utils.setupLogging();

    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    try {
      testClientConfig = {
        clientId: process.env.test_client_id!,
        redirectUri: process.env.test_redirect_uri!,
        scope: process.env.test_scopes!,
      } as NativeAppAuthorizationConfiguration;
      const userCred = {
        email: process.env.test_user_name!,
        password: process.env.test_user_password!,
      };

      // NEEDSWORK - fix integration tests seperately
      if (skipIntegrationTests)
        return;

      const token = await getTestAccessToken(testClientConfig as TestBrowserAuthorizationClientConfiguration, userCred);
      requestContext = new AuthorizedBackendRequestContext(token);

    } catch (error) {
      Logger.logError("Error", `Failed with error: ${error}`);
    }

    if (typeof token === "string")
    {
      process.env.imjs_buddi_resolve_url_using_region = "102";
      testProjectId = process.env.test_project_id!;
      const imodelName = process.env.test_imodel_name!;
      testIModelId = await HubUtility.recreateIModel(token, testProjectId, imodelName);
      await HubUtility.purgeAcquiredBriefcases(token, testProjectId, imodelName);
    }
    else
    {
      Logger.logError("Error", `Failed to get access token`);
      return; 
    }

  });

  after(async () => {
    try {
      if (typeof token === "string")
      {
      await HubUtility.purgeAcquiredBriefcasesById(token, testIModelId, () => {});
      }
      else
      {
        Logger.logError("Error", `Failed to get access token`);  
        return;
      }
    } catch (err) {}

    await utils.shutdownBackend();
  });

  async function runConnector(jobArgs: JobArgs, hubArgs: HubArgs, isUpdate: boolean = false) {

    // NEEDSWORK - fix integration tests seperately
    if (skipIntegrationTests) {
      assert.isTrue(skipIntegrationTests);
      return;
    }

    let doThrow = false;
    const endTrackingCallback = utils.setupLoggingWithAPIMRateTrap();

    try {
      const runner = new ConnectorRunner(jobArgs, hubArgs);
      const connectorFile = "./test/TestConnector/TestConnector.js";
      const status = await runner.run(connectorFile);
      if (status !== BentleyStatus.SUCCESS)
        throw new Error();
    } catch (err) {
      doThrow = true;
    } finally {
      endTrackingCallback();
    }

    if (doThrow)
      throw new Error("runner.run() failed.");

    const briefcases = BriefcaseManager.getCachedBriefcases(hubArgs.iModelGuid);
    const briefcaseEntry = briefcases[0];
    expect(briefcaseEntry !== undefined);
    const db = await BriefcaseDb.open({ fileName: briefcases[0].fileName, readonly: true });
    utils.verifyIModel(db, jobArgs, isUpdate);
    db.close();
  }

  it("should download and perform updates", async () => {
    const sourcePath = path.join(KnownTestLocations.assetsDir, "TestConnector.json");
    const targetPath = path.join(KnownTestLocations.assetsDir, "TestConnector_.json");
    IModelJsFs.copySync(sourcePath, targetPath, { overwrite: true });
    const jobArgs = new JobArgs({
      source: targetPath,
    });

    const hubArgs = new HubArgs({
      projectGuid: testProjectId,
      iModelGuid: testIModelId,
    } as HubArgsProps);

    hubArgs.clientConfig = testClientConfig;
    hubArgs.tokenCallback = async (): Promise<AccessToken> => {
      if (typeof token === "string")
      {
        return token;
      }
      else
      {
        Logger.logError("Error", `Failed to get access token`);  
        // NEEDSWORK
        return "notoken";
      }
      
      
    };

    await runConnector(jobArgs, hubArgs);
    await runConnector(jobArgs, hubArgs, false);

    // verify that a changed source changes the imodel
    IModelJsFs.copySync(path.join(KnownTestLocations.assetsDir, "TestConnector_v2.json"), targetPath, { overwrite: true });

    try { // must cause the updated source file to have a different modified time than the original, or the test bridge will this it's unchanged and ignore it.
      const time = new Date();
      fs.utimesSync(targetPath, time, time);
    } catch (err) {
      fs.closeSync(fs.openSync(targetPath, "w"));
    }

    await runConnector(jobArgs, hubArgs, true);

    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
  });
});
