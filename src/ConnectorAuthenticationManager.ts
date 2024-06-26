/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { type AccessToken, Logger } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import { LoggerCategories } from "./LoggerCategory";
import { NodeCliAuthorizationClient, NodeCliAuthorizationConfiguration } from "@itwin/node-cli-authorization";

export type AccessTokenGetter = (() => Promise<AccessToken>);
export type AccessTokenCallbackUrl = string;
type AccessTokenWExpirationGetter = (() => Promise<TokenExpirationPair>);

/**
 * Abstract class which implements AuthorizationClient AND implements a
 * getCachedTokenIfNotExpired method to handle caching of tokens with known expirations.  Classes which extend
 * CachedTokenClient should implement and pass a function with type AccessTokenWExpirationGetter to getCachedTokenIfNotExpired
 */
abstract class CachedTokenClient implements AuthorizationClient {
  public async getAccessToken(): Promise<string> {
    throw new Error("Method not implemented.");
  }
  private _cachedToken?: CachedToken;

  private initCachedToken(token: string, expiration: number): void {
    this._cachedToken = new CachedToken(token, expiration);
  }

  /**
   * Returns either a freshToken if there is no cached token or if currently cached token has expired, otherwise it will return a fresh token
   * @param freshTokenGetter is an async which is of type AccessTokenWExpirationGetter
   * @returns either a freshToken or a cached token
   */
  protected async getCachedTokenIfNotExpired(freshTokenGetter: AccessTokenWExpirationGetter): Promise<string>{
    const currTime = Date.now();
    if (this._cachedToken && !this._cachedToken?.expired) {
      Logger.logInfo(LoggerCategories.Framework, `${currTime} Using Cached Token - Expires ${this._cachedToken.expirationTime}`);
      return this._cachedToken.token;
    } else{
      const tePair: TokenExpirationPair = await freshTokenGetter ();
      this.initCachedToken (tePair.token, tePair.expiration);
      Logger.logInfo(LoggerCategories.Framework, `${currTime} Caching Fresh Token - Expires ${currTime + tePair.expiration}`);
      return tePair.token;
    }
  }
}

/**
 * A special implementation of a CachedTokenClient whose constructor takes a single callback URL.
 * This will cache the token locally until it has expired based on the expiration time in the URL response.
 */
export class CallbackUrlClient extends CachedTokenClient {
  private _callbackUrl: AccessTokenCallbackUrl;

  constructor(callbackUrl: AccessTokenCallbackUrl) {
    super();
    this._callbackUrl = callbackUrl;
  }
  public override async getAccessToken(): Promise<string> {
    return this.getCachedTokenIfNotExpired (async () => {

      const response = await this.fetch();
      const responseJSON = await response.json();
      const tokenStr = responseJSON.access_token;
      const expiresIn = await responseJSON.expires_in;
      const expiration = Date.now() + expiresIn*1E3; // convert to milliseconds
      const tePair: TokenExpirationPair = {token:tokenStr, expiration};
      return tePair;
    });
  }

  protected  async fetch(): Promise<Response> {
    const response =await fetch(this._callbackUrl);
    return response;
  }
}

export interface DummyCallbackUrlParams {
  callbackUrl: AccessTokenCallbackUrl;  // dummy callback URL - for show only
  token: string;                        // the token to return
  expiration: number;                   // in seconds
}

export class DummyCallbackUrlClient extends CallbackUrlClient {
  private _dummyToken: string;
  private _dummyExpiration: number;

  constructor(dummyParams: DummyCallbackUrlParams) {
    super(dummyParams.callbackUrl);
    this._dummyToken = dummyParams.token;
    this._dummyExpiration = dummyParams.expiration;

  }

  protected override async fetch(): Promise<Response> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return new Response(JSON.stringify({access_token: this._dummyToken, expires_in: this._dummyExpiration}));
  };
}

/**
 * A special implematation of an AuthorizationClient whose constructor takes a single tokenCallback. This does no additional caching.
 */
export class CallbackClient implements AuthorizationClient {
  private _tokenCallback: AccessTokenGetter;
  constructor(tokenCallback: AccessTokenGetter) {
    this._tokenCallback = tokenCallback;
  }
  public async getAccessToken(): Promise<string> {
    const tokenStr = await this._tokenCallback();
    return tokenStr;
  }
}

/**
 * This holds a token as a string and its absolute expiration.
 */
interface TokenExpirationPair {token: string, expiration: number}

/**
 * A type which holds the parameters for the ConnectorAuthenticationManager
 */
interface ConnectorAuthenticationManagerParams {
  callback?: AccessTokenGetter;
  callbackUrl?: AccessTokenCallbackUrl;
  authClientConfig?: NodeCliAuthorizationConfiguration;
  dummyParams?: DummyCallbackUrlParams;
}

/**
 * A class used for caching tokens.  Has constructor and GetExpirationTime and IsExpired methods.
 */
class CachedToken {
  private _token: string;
  private _expiration: number;  // milliseconds
  private _expiryBuffer: number;// milliseconds
  // default expiry buffer to 5 minutes in milliseconds
  constructor(token: string, expiration: number, expiryBuffer: number = 60*5*1000) {
    this._token = token;
    this._expiration = expiration;    // milliseconds
    this._expiryBuffer = expiryBuffer;// milliseconds
  }

  public get expirationTime(): number {
    return this._expiration;
  }

  public get expired(): boolean {
    return this.expirationTime - Date.now() <= this._expiryBuffer;
  }

  public get token(): string {
    return this._token;
  }

}

export class ConnectorAuthenticationManager {
  private _authClient?: AuthorizationClient;
  constructor(private _cAMParams: ConnectorAuthenticationManagerParams) {

  }

  private initializeCallbackClient(callback: AccessTokenGetter): CallbackClient {
    return new CallbackClient (callback);
  }

  private initializeCallbackUrlClient(authClient: AccessTokenCallbackUrl){
    return new CallbackUrlClient(authClient);
  }

  private async initializeInteractiveClient(authClient: NodeCliAuthorizationConfiguration){
    const ncliClient = new NodeCliAuthorizationClient(authClient);
    // From docs... If signIn hasn't been called, the AccessToken will remain empty.
    await ncliClient.signIn();
    return ncliClient;
  }

  private async initializeDummyCallbackUrlClient(dummyParams: DummyCallbackUrlParams){
    return new DummyCallbackUrlClient(dummyParams);
  }

  public async initialize() {
    if (this._cAMParams.callback)
      this._authClient = this.initializeCallbackClient (this._cAMParams.callback);
    else if (this._cAMParams.callbackUrl)
      this._authClient = this.initializeCallbackUrlClient(this._cAMParams.callbackUrl);
    else if (this._cAMParams.authClientConfig)
      this._authClient = await this.initializeInteractiveClient(this._cAMParams.authClientConfig);
    else if (this._cAMParams.dummyParams)
      this._authClient = await this.initializeDummyCallbackUrlClient(this._cAMParams.dummyParams);
    else
      throw new Error(`Must pass callback, callbackUrl or an auth client!`);
  }
  /**
   * async method which returns the access token regardless of the type:
   * interactive or non-interactive and cached or not cached
   * @returns a string containing the access token
   */
  public async getAccessToken(): Promise<string> {
    if (this._authClient === undefined)
      throw new Error("Auth Client is not defined!");

    const newToken = await this._authClient.getAccessToken();
    return newToken;
  }
}
