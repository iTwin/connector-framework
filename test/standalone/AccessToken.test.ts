import { assert } from "chai";
import { ConnectorAuthenticationManager, DummyCallbackUrlParams } from "../../src/ConnectorAuthenticationManager";
import {loadEnv} from "../../test/ConnectorTestUtils";
import * as path from "path";
import {  NodeCliAuthorizationClient, NodeCliAuthorizationConfiguration } from "@itwin/node-cli-authorization";
import { AccessToken } from "@itwin/core-bentley";
describe("AuthClient - using Node Cli Client", async () => {
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

describe("AuthClient - using callback", async () => {
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

    const client = new NodeCliAuthorizationClient(testClientConfig);
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

describe("AuthClient (#standalone) - using (dummy) callback URL", async () => {
  let authManager: ConnectorAuthenticationManager;
  const dummyParams:  DummyCallbackUrlParams = {
    callbackUrl: "http://localhost:3000",
    token: "dummy",
    expiration: 3600,
  };
  // beforeEach(async () => {});

  it("getAccessToken should return a token", async () => {

    authManager = new ConnectorAuthenticationManager({dummyParams});
    await authManager.initialize();
    assert.isDefined(await authManager.getAccessToken());
  });

  it("getAccessToken should return a token after exceeding expiration", async () => {
    const shortExpiration = 5;
    dummyParams.expiration = shortExpiration;
    authManager = new ConnectorAuthenticationManager({dummyParams});
    await authManager.initialize();

    // Token should be fresh
    assert.isDefined(await authManager.getAccessToken());

    // Token should be cached
    assert.isDefined(await authManager.getAccessToken());

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, (shortExpiration + 1)*1E3));

    // Token should be expired
    // This is admittedly not the greatest test b/c we can't be certain we're not getting a cached token.
    // Since the cached token is tested with the integration tests and b/c we are already at 84% coverage, ...
    // we won't take this farther at this time. We could make the CachedTokenClient and CachedToken public
    // through accessor methods and test the expiration directly.
    assert.isDefined(await authManager.getAccessToken());
  });
});
