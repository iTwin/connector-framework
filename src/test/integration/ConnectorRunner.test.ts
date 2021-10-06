/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BentleyStatus, ClientRequestContext, Id64String, Logger } from "@bentley/bentleyjs-core"; // config is missing, which makes us unable to set environment and im not sure what the new way to do that is
import { AuthorizedBackendRequestContext, BriefcaseDb, BriefcaseManager, IModelJsFs } from "@bentley/imodeljs-backend";
import { NativeAppAuthorizationConfiguration } from "@bentley/imodeljs-common";
import { AccessToken } from "@bentley/itwin-client";
import { getTestAccessToken, TestBrowserAuthorizationClientConfiguration } from "@bentley/oidc-signin-tool";
import { expect } from "chai";
import { ConnectorRunner } from "../../ConnectorRunner";
import { JobArgs, HubArgs, HubArgsProps } from "../../Args";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";
import * as utils from "../ConnectorTestUtils";
import * as path from "path";
import * as fs from "fs";

describe("iTwin Connector Fwk (#integration)", () => {

  let testProjectId: Id64String;
  let testIModelId: Id64String;
  let testClientConfig: NativeAppAuthorizationConfiguration;
  let requestContext: AuthorizedBackendRequestContext;

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
      const token = await getTestAccessToken(testClientConfig as TestBrowserAuthorizationClientConfiguration, userCred, 102);
      requestContext = new AuthorizedBackendRequestContext(token);
    } catch (error) {
      Logger.logError("Error", `Failed with error: ${error}`);
    }

    // Config.App.set("imjs_buddi_resolve_url_using_region", "102");
    testProjectId = process.env.test_project_id!;
    const imodelName = process.env.test_imodel_name!;
    testIModelId = await HubUtility.recreateIModel(requestContext, testProjectId, imodelName);
    await HubUtility.purgeAcquiredBriefcases(requestContext, testProjectId, imodelName);
  });

  after(async () => {
    try {
      await HubUtility.purgeAcquiredBriefcasesById(requestContext, testIModelId, () => {});
    } catch (err) {}

    await utils.shutdownBackend();
  });

  async function runConnector(jobArgs: JobArgs, hubArgs: HubArgs, isUpdate: boolean = false) {
    let doThrow = false;
    const endTrackingCallback = utils.setupLoggingWithAPIMRateTrap();

    try {
      const runner = new ConnectorRunner(jobArgs, hubArgs);
      const connectorFile = "./test/integration/TestConnector.js";
      const status = await runner.run(connectorFile);
      if (status !== BentleyStatus.SUCCESS)
        throw new Error;
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
      return requestContext.accessToken;
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
