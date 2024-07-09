/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {AccessToken, assert, BentleyStatus, Logger} from "@itwin/core-bentley";
import {ChannelControl, type Subject} from "@itwin/core-backend";
import {ConnectorIssueReporter} from "./ConnectorIssueReporter";
import {DeletionDetectionParams, Synchronizer} from "./Synchronizer";
import * as fs from "fs";
import * as path from "path";
import { LoggerCategories } from "./LoggerCategory";
import { ConnectorAuthenticationManager } from "./ConnectorAuthenticationManager";

/** Abstract implementation of the iTwin Connector.
 * @beta
 */
export abstract class BaseConnector {

  private _synchronizer?: Synchronizer;
  private _jobSubject?: Subject;
  private _issueReporter?: ConnectorIssueReporter;
  private _connectorArgs?: { [otherArg: string]: any };
  private _authMgr?: ConnectorAuthenticationManager;

  public async getAccessToken(): Promise<string|undefined> {
    if (this._synchronizer?.authenticationManager)
      return this._synchronizer.authenticationManager.getAccessToken();

    return undefined;
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

  // override this method in the derived connector class if using not shared channel
  public getChannelKey(): string {
    return ChannelControl.sharedChannelName;
  }

  // override this method to create a single change set group with each connector run
  public createChangeSetGroup(): boolean {
    return false;
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
