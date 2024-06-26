import { expect } from "chai";
import { ConnectorAuthenticationManager } from "../../src/ConnectorAuthenticationManager";
import {loadEnv} from "../../test/ConnectorTestUtils";
import * as path from "path";
import { NodeCliAuthorizationConfiguration } from "@itwin/node-cli-authorization";
describe("ConnectorAuthenticationManager (#standalone) - AuthClient", async () => {
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

  it("should return true when isAuthenticated is called with valid credentials", async () => {

    authManager = new ConnectorAuthenticationManager({authClientConfig: testClientConfig});
    await authManager.initialize();
    const token = await authManager.getAccessToken();
    expect(token !== undefined).to.be.true;
  });
});
