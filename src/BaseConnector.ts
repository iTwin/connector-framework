/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AccessToken } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import { assert, BentleyStatus, Logger } from "@itwin/core-bentley";
import type { Subject } from "@itwin/core-backend";
import type { ConnectorIssueReporter } from "./ConnectorIssueReporter";
import type { DeletionDetectionParams, Synchronizer } from "./Synchronizer";
import * as fs from "fs";
import * as path from "path";
import { LoggerCategories } from "./LoggerCategory";
import { NodeCliAuthorizationClient, NodeCliAuthorizationConfiguration } from "@itwin/node-cli-authorization";


type AccessTokenGetter = (() => Promise<AccessToken>);
type AccessTokenCallbackUrl = string;

class CallbackUrlClient implements AuthorizationClient {
  private _callbackUrl:string;
  constructor (callbackUrl:string) {
      this._callbackUrl = callbackUrl;
  }
  async getAccessToken(): Promise<string> {
      const response = await fetch(this._callbackUrl);
      const tokenStr = await response.json();
      return tokenStr;
  }
}

class CallbackClient implements AuthorizationClient {
  private _tokenCallback:() => Promise<AccessToken>;
  constructor (tokenCallback: () => Promise<AccessToken>) {
      this._tokenCallback = tokenCallback;
  }
  async getAccessToken(): Promise<string> {
      const tokenStr = await this._tokenCallback();
      return tokenStr;
  }
}

class CachedToken {
  private _token:string;
  private _startTime: any;
  private _duration: any;

  constructor (token:string, startTime: number, duration:number) {
  this._token = token;
  this._startTime = startTime;
  this._duration = duration;
  }

  GetExpirationTime () :number {
  return this._startTime + this._duration;
  }

  IsExpired () {
    // current time
    const currentTime = Date.now();

    // expiration time = start time + duration time
    const expirationTime = this.GetExpirationTime ();
    return currentTime >= expirationTime;
  }

  GetToken () : string {
    return this._token;
  }

}
/** Abstract implementation of the iTwin Connector.
 * @beta
 */
export abstract class BaseConnector {

  private _synchronizer?: Synchronizer;
  private _jobSubject?: Subject;
  private _issueReporter?: ConnectorIssueReporter;
  private _connectorArgs?: { [otherArg: string]: any };

  private _authClient? : AuthorizationClient;
  private _cachedToken? : CachedToken;

  public initializeCallbackClient (authClient:AccessTokenGetter){
      this._authClient = new CallbackClient (authClient);
  }

  public initializeCallbackUrlClient (authClient:AccessTokenCallbackUrl){
      this._authClient = new CallbackUrlClient(authClient);
  }

  public initializeInteractiveClient (authClient:NodeCliAuthorizationConfiguration){
          const ncliClient = new NodeCliAuthorizationClient(authClient);
          // From docs... If signIn hasn't been called, the AccessToken will remain empty.
          ncliClient.signIn();
          this._authClient = ncliClient;
  }

  private initCachedToken (token:string, startTime: number, duration:number) {
    this._cachedToken = new CachedToken(token, startTime, duration);
  }
  private getCachedToken () : CachedToken|undefined{
    return this._cachedToken;
  }

  public async getAccessToken () {
  if (this._authClient === undefined)
    throw ("Error: Auth Client is not defined!");

  const ct = this.getCachedToken();
  if (ct && !ct?.IsExpired)
    {
    Logger.logInfo(LoggerCategories.Framework, `${Date.now} Using Cached Token - Expires ${ct.GetExpirationTime()}`);
    return ct.GetToken();
    }
  else{
    const newToken = await this._authClient.getAccessToken();
    const currTime = Date.now();
    // NEEDSWORK 1 hr. = 3600 seconds in (milliseconds)
    const duration = 3.6E6;
    this.initCachedToken (newToken, currTime, duration);
    Logger.logInfo(LoggerCategories.Framework, `${currTime} Caching Fresh Token - Expires ${currTime + duration}`);
    return newToken;
  }

  }

  public static async create(): Promise<BaseConnector> {
    throw new Error("BaseConnector.create() is not implemented!");
  }

  /** If the connector needs to perform any steps once the iModel has been opened */
  public async onOpenIModel(): Promise<BentleyStatus> {
    return BentleyStatus.SUCCESS;
  }

  /** This is called when the synchronization is finished, just before the iModel is closed. The connector can implement this callback if its needs
   * to close the source file or do any other post-synchronization clean-up. The connector should *not* attempt to write to the iModel.
   */
  public onClosingIModel?: () => void;

  /** This is only called the first time this source data is synchronized.  Allows the connector to perform any steps after the Job Subject has been created.  It
   * must call synchronizer.recordDocument on the source data. Called in the [Repository channel]($docs/learning/backend/Channel).
   */
  public abstract initializeJob(): Promise<void>;

  /** The source data can be an actual source file on disk (json, csv, xml, etc), a data dump of a native source (IFC), a URL for a rest API, etc.
   * The connector creates a connection to this source data and performs any steps necessary before reading. Called in the [Repository channel]($docs/learning/backend/Channel).
   */
  public abstract openSourceData(source: string): Promise<void>;

  /** Import any elements that belong in a DefinitionModel (Categories, LineStyles, Materials, etc).  This includes elements necessary for all
   * imodels created by this connector as well as any that are unique to this source data. Called in the [Repository channel]($docs/learning/backend/Channel).
   */
  public abstract importDefinitions(): Promise<any>;

  /** Import schema(s) that every iModel synchronized by this connector will use. Called in the [Repository channel]($docs/learning/backend/Channel). */
  public abstract importDynamicSchema(requestContext?: AccessToken): Promise<any>;

  /** Import schema(s) that are specific to this particular source, in addition to the previously imported domain schema(s). Called in the [Repository channel]($docs/learning/backend/Channel). */
  public abstract importDomainSchema(requestContext?: AccessToken): Promise<any>;

  /** Convert the source data to BIS and insert into the iModel.  Use the Synchronizer to determine whether an item is new, changed, or unchanged. Called in the [connector's private channel]($docs/learning/backend/Channel). */
  public abstract updateExistingData(): Promise<any>;

  /** Create error file with the supplied information for debugging reasons. A default implementation that creates a file at
   * the defined output directory called "SyncError.json" will be used if you do not provide one for some errors in the Synchronize function.
   * Overriding with your own reportError function is done the same way, but you must include the "Override" keyword in the function signature
   * Should be called in other implemented functions if you wish for those to output error reports */
  public reportError(dir: string, description: string, systemName?: string, systemPhase?: string, category?: string, canUserFix?: boolean, descriptionKey?: string, kbArticleLink?: string): void {
    const object = {
      system: systemName,
      phase: systemPhase,
      category,
      descriptionKey,
      description,
      kbLink: (kbArticleLink?.length !== 0 ? kbArticleLink : ""),
      canUserFix,
    };
    Logger.logError("itwin-connector.Framework", `Attempting to write file to ${dir}`);
    fs.writeFileSync(path.join(dir, "SyncError.json"), JSON.stringify(object), {flag: "w"});
  }

  /**
   * A connector can operate in one of two ways with regards to source files and channels:
   * I.	1:1 - Each source file gets its own distinct channel (this is more common)
   * II.	n:1 – A connector can map multiple files into a single channel (this is rare)
   * In the case of #2, it is up to the connector to supply the jobSubject name.
   * See [Channels]($docs/learning/backend/Channel) for an explanation of the concept of channels.
   */
  public getDeletionDetectionParams(): DeletionDetectionParams {
    // default to channel based deletion detection
    const ddp = {fileBased: false, scopeToPartition : false};
    return ddp;
  }

  /**
   * Returns boolean flag to toggle deletion. Defaults to true where elements not marked by onElementSeen
   * deleted by ConnectorRunner. If this flag is set to false, the connector author is responsible for
   * deletion and cleaning up unused elements.
   */
  public shouldDeleteElements(): boolean {
    return true;
  }

  /** Returns the name to be used for the job subject. This only needs to be overridden if the connector supports multiple files per channel, in which case it must be overridden. */
  public getJobSubjectName(sourcePath: string): string {
    return `${this.getConnectorName()}:${sourcePath}`;
  }

  /** Overridable function that must me implemented when the flag shouldUnmapSource is set to true. This method is used to unmap an existing source file in the iModel */
  public async unmapSource(source: string): Promise<void> {
    Logger.logError(LoggerCategories.Framework, `Unmap method is not defined while unmapping ${source}`);
    return;
  }

  public set synchronizer(sync: Synchronizer) {
    assert(this._synchronizer === undefined);
    this._synchronizer = sync;
  }

  public get synchronizer(): Synchronizer {
    assert(this._synchronizer !== undefined);
    return this._synchronizer;
  }

  public set issueReporter(reporter: ConnectorIssueReporter) {
    this._issueReporter = reporter;
  }

  public get issueReporter(): ConnectorIssueReporter {
    assert(this._issueReporter !== undefined);
    return this._issueReporter;
  }

  public set connectorArgs(args: { [otherArg: string]: any } | undefined) {
    this._connectorArgs = args;
  }

  public get connectorArgs(): { [otherArg: string]: any } | undefined {
    return this._connectorArgs;
  }

  public set jobSubject(subject: Subject) {
    assert(this._jobSubject === undefined);
    this._jobSubject = subject;
  }

  public get jobSubject(): Subject {
    assert(this._jobSubject !== undefined);
    return this._jobSubject;
  }

  public abstract getApplicationVersion(): string;
  public abstract getConnectorName(): string;

  /** Returns the description for data changeset. If method is undefined, "Data changes" is used for the description. */
  public getDataChangesDescription?(): string;
}
