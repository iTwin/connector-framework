import { Logger, type AccessToken } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import { LoggerCategories } from "./LoggerCategory";

export type AccessTokenGetter = (() => Promise<AccessToken>);
export type AccessTokenCallbackUrl = string;
type AccessTokenWExpirationGetter = (() => Promise<TokenExpirationPair>);

/**
 * Abstract class which implements AuthorizationClient AND implements a 
 * getCachedTokenIfNotExpired method to handle caching of tokens with known expirations.  Classes which extend 
 * CachedTokenClient should implement and pass a function with type AccessTokenWExpirationGetter to getCachedTokenIfNotExpired
 */
abstract class CachedTokenClient implements AuthorizationClient {
  async getAccessToken(): Promise<string> {
    throw new Error("Method not implemented.");
  }
  private _cachedToken? : CachedToken;

  private initCachedToken (token:string, expiration:number) : void {
    this._cachedToken = new CachedToken(token, expiration);
  }

  /**
   * Returns either a freshToken if there is no cached token or if currently cached token has expired, otherwise it will return a fresh token
   * @param freshTokenGetter is an async which is of type AccessTokenWExpirationGetter
   * @returns either a freshToken or a cached token
   */
  protected async getCachedTokenIfNotExpired (freshTokenGetter: AccessTokenWExpirationGetter) : Promise<string>{
    const currTime = Date.now();
    if (this._cachedToken && !this._cachedToken?.Expired)
      {
      Logger.logInfo(LoggerCategories.Framework, `${currTime} Using Cached Token - Expires ${this._cachedToken.ExpirationTime}`);
      return this._cachedToken.Token;
      }
    else{
      const tePair : TokenExpirationPair = await freshTokenGetter ();
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
  private _callbackUrl:AccessTokenCallbackUrl;
  constructor (callbackUrl:AccessTokenCallbackUrl) {
    super();
      this._callbackUrl = callbackUrl;
  }
  override async getAccessToken(): Promise<string> {
    return await this.getCachedTokenIfNotExpired (async () => {
      
      const response = await fetch(this._callbackUrl);
      const responseJSON = await response.json();
      const tokenStr = responseJSON.access_token;
      const expires_in = await responseJSON.expires_in;
      const expiration = Date.now() + expires_in*1E3; // convert to milliseconds
      let tePair : TokenExpirationPair = {token:tokenStr, expiration:expiration};
      return tePair;});
  }
}

/**
 * A special implematation of an AuthorizationClient whose constructor takes a single tokenCallback. This does no additional caching.
 */
export class CallbackClient implements AuthorizationClient {
  private _tokenCallback:AccessTokenGetter;
  constructor (tokenCallback: AccessTokenGetter) {
      this._tokenCallback = tokenCallback;
  }
  async getAccessToken(): Promise<string> {
      const tokenStr = await this._tokenCallback();
      return tokenStr;
  }
}

/**
 * This holds a token as a string and its absolute expiration.
 */
type TokenExpirationPair = {token : string, expiration:number};

/**
 * A class used for caching tokens.  Has constructor and GetExpirationTime and IsExpired methods.
 */
class CachedToken {
  private _token:string;
  private _expiration: number;  // milliseconds
  private _expiryBuffer: number;// milliseconds
  // default expiry buffer to 5 minutes in milliseconds
  constructor (token:string, expiration:number, expiryBuffer: number = 60*5*1000) {
  this._token = token;
  this._expiration = expiration;    // milliseconds
  this._expiryBuffer = expiryBuffer;// milliseconds
  }

  get ExpirationTime () :number {
  return this._expiration;
  }

  get Expired () : boolean {
    return this.ExpirationTime - Date.now() <= this._expiryBuffer;
  }

  get Token () : string {
    return this._token;
  }

}

export class ConnectorAuthenticationManager {
    
}