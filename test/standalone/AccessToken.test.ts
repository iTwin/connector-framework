import { assert } from "chai";
import { ConnectorAuthenticationManager } from "../../src/ConnectorAuthenticationManager";
import {loadEnv} from "../../test/ConnectorTestUtils";
import * as path from "path";
import { NodeCliAuthorizationConfiguration } from "@itwin/node-cli-authorization";
import { TestBrowserAuthorizationClient } from "@itwin/oidc-signin-tool";
import { AccessToken } from "@itwin/core-bentley";
describe("AuthClient (#standalone) - using Node Cli Client", async () => {
  let authManager: ConnectorAuthenticationManager;
  loadEnv(path.join(__dirname, "../../", ".env"));

  const testClientConfig: NodeCliAuthorizationConfiguration = {
    clientId: process.env.desktop_client_id!,
    redirectUri: process.env.desktop_redirect_uri!,
    scope: process.env.desktop_scopes!,
    issuerUrl: `https://${process.env.imjs_url_prefix || ""}ims.bentley.com`,
  };

  beforeEach(async () => {

  });

  it("getAccessToken should return a token", async () => {
    authManager = new ConnectorAuthenticationManager({authClientConfig: testClientConfig});
    await authManager.initialize();
    assert.isDefined(await authManager.getAccessToken());
  });
});

describe("AuthClient (#standalone) - using callback", async () => {
  let authManager: ConnectorAuthenticationManager;
  let token;
  loadEnv(path.join(__dirname, "../../", ".env"));

  beforeEach(async () => {
    const testClientConfig = {
      clientId: process.env.test_client_id!,
      redirectUri: process.env.test_redirect_uri!,
      scope: process.env.test_scopes!,
      authority: `https://${process.env.imjs_url_prefix}ims.bentley.com`,
    };

    const userCred = {
      email: process.env.test_user_name!,
      password: process.env.test_user_password!,
    };
    const client = new TestBrowserAuthorizationClient(testClientConfig, userCred);
    token = await client.getAccessToken();

    if (!token) {
      throw new Error("Token not defined");
    }
  });

  it("getAccessToken should return a token", async () => {
    const tokenCallback = async (): Promise<AccessToken> => {
      return token!;
    };
    authManager = new ConnectorAuthenticationManager({callback: tokenCallback});
    await authManager.initialize();
    assert.isDefined(await authManager.getAccessToken());
  });
});
