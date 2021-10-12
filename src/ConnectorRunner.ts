/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModel, LocalBriefcaseProps, OpenBriefcaseProps, SubjectProps, SynchronizationConfigLinkProps } from "@bentley/imodeljs-common";
import { ChangesType } from "@bentley/imodelhub-client";
import { assert, BentleyStatus, ClientRequestContext, Guid, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { BriefcaseDb, BriefcaseManager, IModelDb, NativeHost, RequestNewBriefcaseArg, SnapshotDb, StandaloneDb, Subject, SubjectOwnsSubjects, SynchronizationConfigLink, LinkElement } from "@bentley/imodeljs-backend";
import { ElectronAuthorizationBackend } from "@bentley/electron-manager/lib/ElectronBackend";
import { BaseConnector } from "./BaseConnector";
import { LoggerCategories } from "./LoggerCategory";
import { AllArgsProps, JobArgs, HubArgs } from "./Args";
import { AuthorizedClientRequestContext, AccessToken } from "@bentley/itwin-client";
import { Synchronizer } from "./Synchronizer";
import { ConnectorIssueReporter } from "./ConnectorIssueReporter";
import * as fs from "fs";
import * as path from "path";

export class ConnectorRunner {

  private _jobArgs: JobArgs;
  private _hubArgs?: HubArgs;
  // private _bankArgs?: BankArgs;

  private _db?: IModelDb;
  private _connector?: BaseConnector;
  private _issueReporter?: ConnectorIssueReporter;
  private _reqContext?: ClientRequestContext | AuthorizedClientRequestContext;

  /**
   * @throws Error when jobArgs or/and hubArgs are malformated or contain invalid arguments
   */
  constructor(jobArgs: JobArgs, hubArgs?: HubArgs) {
    if (!jobArgs.isValid())
      throw new Error("Invalid jobArgs");
    this._jobArgs = jobArgs;

    if (hubArgs) {
      if (!hubArgs.isValid())
        throw new Error("Invalid hubArgs");
      this._hubArgs = hubArgs;
    }

    Logger.initializeToConsole();
    const { loggerConfigJSONFile } = jobArgs;
    if (loggerConfigJSONFile && path.extname(loggerConfigJSONFile) === "json" && fs.existsSync(loggerConfigJSONFile))
      Logger.configureLevels(require(loggerConfigJSONFile));
    else
      Logger.setLevelDefault(LogLevel.Info);
  }

  /**
   * Generates a ConnectorRunner instance from a .json argument file
   * @param file absolute path to a .json file that stores arguments
   * @returns ConnectorRunner
   * @throws Error when file does not exist
   */
  public static fromFile(file: string): ConnectorRunner {
    if (!fs.existsSync(file))
      throw new Error(`${file} does not exist`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const runner = ConnectorRunner.fromJSON(json);
    return runner;
  }

  /**
   * Generates a ConnectorRunner instance from json body
   * @param json
   * @returns ConnectorRunner
   * @throws Error when content does not include "jobArgs" as key
   */
  public static fromJSON(json: AllArgsProps): ConnectorRunner {
    const supportedVersion = "0.0.1";
    if (!json.version || json.version !== supportedVersion)
      throw new Error(`Arg file has invalid version ${json.version}. Supported version is ${supportedVersion}.`);
    if (!(json.jobArgs))
      throw new Error("jobArgs is not defined");
    const jobArgs = new JobArgs(json.jobArgs);

    let hubArgs: HubArgs | undefined = undefined;
    if (json.hubArgs)
      hubArgs = new HubArgs(json.hubArgs);

    const runner = new ConnectorRunner(jobArgs, hubArgs);
    return runner;
  }

  public async getAuthReqContext(): Promise<AuthorizedClientRequestContext> {
    if (!this._reqContext || !(this._reqContext instanceof AuthorizedClientRequestContext))
      throw new Error("AuthorizedClientRequestContext has not been loaded.");
    if (this._reqContext.accessToken.isExpired(5)) {
      this._reqContext.accessToken = await this.getToken();
      Logger.logInfo(LoggerCategories.Framework, "AccessToken Refreshed");
    }
    return this._reqContext;
  }

  public async getReqContext(): Promise<ClientRequestContext | AuthorizedClientRequestContext> {
    if (!this._reqContext)
      throw new Error("ConnectorRunner.reqContext has not been loaded. Must sign in first.");

    let reqContext: ClientRequestContext | AuthorizedClientRequestContext;
    if (this.db.isBriefcaseDb())
      reqContext = await this.getAuthReqContext();
    else
      reqContext = this._reqContext;

    return reqContext;
  }

  public get jobArgs(): JobArgs {
    return this._jobArgs;
  }

  public get hubArgs(): HubArgs {
    if (!this._hubArgs)
      throw new Error(`ConnectorRunner.hubArgs is not defined for current iModel with type = ${this.jobArgs.dbType}.`);
    return this._hubArgs;
  }

  public set issueReporter(reporter: ConnectorIssueReporter) {
    this._issueReporter = reporter;
  }

  public get jobSubjectName(): string {
    let name = this.jobArgs.source;

    const moreArgs = this.jobArgs.moreArgs;
    if (moreArgs && moreArgs.pcf && moreArgs.pcf.subjectNode)
      name = moreArgs.pcf.subjectNode;

    return name;
  }

  public get db(): IModelDb {
    if (!this._db)
      throw new Error("IModelDb has not been loaded.");
    return this._db;
  }

  public get connector(): BaseConnector {
    if (!this._connector)
      throw new Error("Connector has not been loaded.");
    return this._connector;
  }

  /**
   * Safely executes a connector job
   * This method does not throw any errors
   * @returns BentleyStatus
   */
  public async run(connectorFile: string): Promise<BentleyStatus> {
    let runStatus = BentleyStatus.SUCCESS;
    try {
      await this.runUnsafe(connectorFile);
    } catch (err) {
      const msg = (err as any).message;
      Logger.logError(LoggerCategories.Framework, msg);
      Logger.logError(LoggerCategories.Framework, `Failed to execute connector module - ${connectorFile}`);
      this.connector.reportError(this.jobArgs.stagingDir, msg, "ConnectorRunner", "Run", LoggerCategories.Framework);
      runStatus = BentleyStatus.ERROR;
      await this.onFailure(err);
    } finally {
      await this.onFinish();
    }
    return runStatus;
  }

  private async runUnsafe(connectorFile: string) {
    Logger.logInfo(LoggerCategories.Framework, "Connector Job has started");

    let reqContext: ClientRequestContext | AuthorizedClientRequestContext;

    // load

    await this.loadConnector(connectorFile);
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.connector has been loaded.");

    await this.loadReqContext();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.reqContext has been loaded.");

    await this.loadDb();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.db has been loaded.");

    await this.loadSynchronizer();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.connector.synchronizer has been loaded.");

    this.initProgressMeter();

    // source data

    Logger.logInfo(LoggerCategories.Framework, "connector.openSourceData started.");
    await this.enterChannel();

    const synchConfig = await this.insertSynchronizationConfigLink();
    await this.connector.openSourceData(this.jobArgs.source);
    await this.connector.onOpenIModel();

    await this.persistChanges(`Initialization`);
    Logger.logInfo(LoggerCategories.Framework, "connector.openSourceData ended.");

    // domain schema

    Logger.logInfo(LoggerCategories.Framework, "connector.updateDomainSchema started");
    await this.enterChannel();

    reqContext = await this.getReqContext();
    await this.connector.importDomainSchema(reqContext);

    await this.persistChanges(`Domain Schema Update`);
    Logger.logInfo(LoggerCategories.Framework, "connector.updateDomainSchema ended");

    // dynamic schema

    Logger.logInfo(LoggerCategories.Framework, "connector.importDynamicSchema started");
    await this.enterChannel();

    reqContext = await this.getReqContext();
    await this.connector.importDynamicSchema(reqContext);

    await this.persistChanges("Dynamic Schema Update");
    Logger.logInfo(LoggerCategories.Framework, "connector.importDynamicSchema ended");

    // initialize job subject

    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.updateJobSubject started");
    await this.enterChannel();

    const jobSubject = await this.updateJobSubject();

    await this.persistChanges(`Job Subject Update`);
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.updateJobSubject ended.");

    // definitions changes

    Logger.logInfo(LoggerCategories.Framework, "connector.importDefinitions started");
    await this.enterChannel();

    await this.connector.initializeJob();
    await this.connector.importDefinitions();

    await this.persistChanges("Definitions Update");
    Logger.logInfo(LoggerCategories.Framework, "connector.importDefinitions ended");

    // data changes

    Logger.logInfo(LoggerCategories.Framework, "connector.updateExistingData started");
    await this.enterChannel();

    await this.connector.updateExistingData();
    await this.updateSynchronizationConfigLink(synchConfig);
    this.updateDeletedElements();
    this.updateProjectExtent();

    await this.persistChanges("Data Update");
    Logger.logInfo(LoggerCategories.Framework, "connector.updateExistingData ended");

    Logger.logInfo(LoggerCategories.Framework, "Connector Job has completed");
  }

  private async onFailure(err: any) {
    if (this._db && this._db.isBriefcaseDb()) {
      (this._db as BriefcaseDb).abandonChanges();
    }
    this.recordError(err);
  }

  public recordError(err: any) {
    const errorFile = this.jobArgs.errorFile;
    const errorStr = JSON.stringify({
      "Id": this._connector ? this._connector.getApplicationId : -1,
      "Message": "Failure",
      "Description": err.message,
      "ExtendedData": {}, 
    });
    fs.writeFileSync(errorFile, errorStr);
    Logger.logInfo(LoggerCategories.Framework, `Error recorded at ${errorFile}`);
  }

  private async onFinish() {
    if (this._db) {
      this._db.abandonChanges();
      this._db.close();
    }

    if (this._connector && this.connector.issueReporter)
      await this.connector.issueReporter.publishReport();
  }

  private updateDeletedElements() {
    if (this.jobArgs.doDetectDeletedElements)
      this.connector.synchronizer.detectDeletedElements();
  }

  private updateProjectExtent() {
    const res = this.db.computeProjectExtents({
      reportExtentsWithOutliers: false,
      reportOutliers: false,
    });
    this.db.updateProjectExtents(res.extents);
  }

  private async updateJobSubject(): Promise<Subject> {
    const code = Subject.createCode(this.db, IModel.rootSubjectId, this.jobSubjectName);
    const existingSubjectId = this.db.elements.queryElementIdByCode(code);

    let subject: Subject;

    if (existingSubjectId) {
      subject = this.db.elements.getElement<Subject>(existingSubjectId);
    } else {
      const jsonProperties: any = {
        Subject: {
          Job: {
            Properties: {
              ConnectorVersion: this.connector.getApplicationVersion(),
              ConnectorType: "JSConnector",
            },
            Connector: this.connector.getConnectorName(),
          }
        },
      };

      const root = this.db.elements.getRootSubject();
      const subjectProps: SubjectProps = {
        classFullName: Subject.classFullName,
        model: root.model,
        code,
        jsonProperties,
        parent: new SubjectOwnsSubjects(root.id),
      };
      await this.db.locks.acquireSharedLock(IModel.dictionaryId);
      const newSubjectId = this.db.elements.insertElement(subjectProps);
      subject = this.db.elements.getElement<Subject>(newSubjectId);
      await this.db.locks.releaseAllLocks();
    }

    this.connector.jobSubject = subject;
    return subject;
  }

  private initProgressMeter() {}

  private async loadConnector(connectorFile: string) {
    const connectorClass = require(connectorFile).default;
    this._connector = await connectorClass.create();
  }

  private async insertSynchronizationConfigLink(){
    assert(this._db !== undefined);
    let synchConfigData = {
      classFullName:  SynchronizationConfigLink.classFullName,
      model: IModel.repositoryModelId,
      code: LinkElement.createCode(this._db, IModel.repositoryModelId, "SynchConfig"),
    };
    if (this.jobArgs.synchConfigFile) {
      synchConfigData = require(this.jobArgs.synchConfigFile);
    }
    await this._db.locks.acquireSharedLock(IModel.dictionaryId);
    const element =  this._db.elements.insertElement(synchConfigData);
    await this._db.locks.releaseAllLocks();
    return element;

  }
  private async updateSynchronizationConfigLink(synchConfigId: string){
    assert(this._db !== undefined);
    const synchConfigData = {
      id: synchConfigId,
      classFullName:  SynchronizationConfigLink.classFullName,
      model: IModel.repositoryModelId,
      code: LinkElement.createCode(this._db, IModel.repositoryModelId, "SynchConfig"),
      lastSuccessfulRun: Date.now().toString(),
    };
    await this._db.locks.acquireExclusiveLock(synchConfigData.id);
    this._db.elements.updateElement(synchConfigData);
    await this._db.locks.releaseAllLocks();
  }

  private async loadReqContext() {
    const activityId = Guid.createValue();
    const appId = this.connector.getApplicationId();
    const appVersion = this.connector.getApplicationVersion();
    if (this.jobArgs.dbType === "briefcase") {
      const token = await this.getToken();
      this._reqContext = new AuthorizedClientRequestContext(token, activityId, appId, appVersion);
    } else {
      this._reqContext = new ClientRequestContext();
    }
  }

  private async getToken() {
    let token: AccessToken;
    if (!this.hubArgs)
      throw new Error("ConnectorRunner._getToken: undefined hubArgs.");
    if (this.hubArgs.doInteractiveSignIn)
      token = await this.getTokenInteractive();
    else
      token = await this.getTokenSilent();
    return token;
  }

  private async getTokenSilent() {
    let token: AccessToken;
    if (this.hubArgs && this.hubArgs.tokenCallbackUrl) {
      const response = await fetch(this.hubArgs.tokenCallbackUrl);
      const tokenStr = await response.json();
      token = AccessToken.fromTokenString(tokenStr);
    } else if (this.hubArgs && this.hubArgs.tokenCallback) {
      token = await this.hubArgs.tokenCallback();
    } else {
      throw new Error("Define either HubArgs.acccessTokenCallbackUrl or HubArgs.accessTokenCallback to retrieve accessToken");
    }
    return token;
  }

  private async getTokenInteractive() {
		const client = new ElectronAuthorizationBackend();
    await client.initialize(this.hubArgs.clientConfig);
    return new Promise<AccessToken>((resolve, reject) => {
      NativeHost.onUserStateChanged.addListener((token) => {
        if (token !== undefined)
          resolve(token);
        else
          reject(new Error("Failed to sign in"));
      });
      client.signIn();
    });
  }

  private async loadDb() {
    if (this.jobArgs.dbType === "briefcase") {
      await this.loadBriefcaseDb();
    } else if (this.jobArgs.dbType === "standalone") {
      this.loadStandaloneDb();
    } else if (this.jobArgs.dbType === "snapshot") {
      this.loadSnapshotDb();
    } else {
      throw new Error("Invalid JobArgs.dbType");
    }
  }

  private async loadSnapshotDb() {
    const cname = this.connector.getConnectorName();
    const fname = `${cname}.bim`;
    const fpath = path.join(this.jobArgs.stagingDir, fname);
    if (fs.existsSync(fpath))
      fs.unlinkSync(fpath);
    this._db = SnapshotDb.createEmpty(fpath, { rootSubject: { name: cname } });
  }

  private async loadStandaloneDb() {
    const cname = this.connector.getConnectorName(); 
    const fname = `${cname}.bim`;
    const fpath = path.join(this.jobArgs.stagingDir, fname);
    if (fs.existsSync(fpath))
      this._db = StandaloneDb.openFile(fpath);
    else
      this._db = StandaloneDb.createEmpty(fpath, { rootSubject: { name: cname } });
  }

  private async loadBriefcaseDb() {

    let bcFile: string | undefined = undefined;
    if (this.hubArgs.briefcaseFile) {
      bcFile = this.hubArgs.briefcaseFile;
    } else {
      const briefcases = BriefcaseManager.getCachedBriefcases(this.hubArgs.iModelGuid);
      for (const bc of briefcases) {
        assert(bc.iModelId === this.hubArgs.iModelGuid);
        if (this.hubArgs.briefcaseId && bc.briefcaseId !== this.hubArgs.briefcaseId)
          continue;
        bcFile = bc.fileName;
        break;
      }
    }

    const reqContext = await this.getAuthReqContext();
    let openProps: OpenBriefcaseProps;
    if (bcFile) {
      openProps = { fileName: bcFile };
    } else {
      const reqArg: RequestNewBriefcaseArg = { iTwinId: this.hubArgs.projectGuid, iModelId: this.hubArgs.iModelGuid };
      if (this.hubArgs.briefcaseId)
        reqArg.briefcaseId = this.hubArgs.briefcaseId;

      const bcProps: LocalBriefcaseProps = await BriefcaseManager.downloadBriefcase(reqArg);
      if (this.jobArgs.updateDbProfile || this.jobArgs.updateDomainSchemas)
        await BriefcaseDb.upgradeSchemas(bcProps);

      openProps = { fileName: bcProps.fileName };
    }

    this._db = await BriefcaseDb.open(openProps);
    // (this._db as BriefcaseDb).concurrencyControl.startBulkMode(); // not sure what/if anything is the new "startBulkMode"
  }

  private async loadSynchronizer() {
    const reqContext = await this.getReqContext();
    const synchronizer = new Synchronizer(this.db, false, reqContext as AuthorizedClientRequestContext);
    this.connector.synchronizer = synchronizer;
  }

  private async persistChanges(changeDesc: string) {
    const { revisionHeader } = this.jobArgs;
    const comment = `${revisionHeader} - ${changeDesc}`;
    if (this.db.isBriefcaseDb()) {
      const authReqContext = await this.getAuthReqContext();
      this._db = this.db as BriefcaseDb;
      // await this.db.concurrencyControl.request(authReqContext); // pr changes say that you acquire locks before update or insert instead of what is happening here, not sure if he means actually before the insert or if it should be done when we SAVE a update/insert
      await this.db.pullChanges();
      this.db.saveChanges(comment);
      await this.db.pushChanges({user: authReqContext, description: comment});
    } else {
      this.db.saveChanges(comment);
    }
  }

  private async enterChannel() {
    if (!this.db.isBriefcaseDb())
      return;

    this._db = this.db as BriefcaseDb;
    // all of these arguments are no longer present, not sure if i just dont know where they are though, doing the checks that were added instead
    // if (!this.db.locks.isBulkMode)
    //   this.db.concurrencyControl.startBulkMode();
    // if (this.db.concurrencyControl.hasPendingRequests)
    //   throw new Error("has pending requests");
    // if (this.db.concurrencyControl.locks.hasSchemaLock)
    //   throw new Error("has schema lock");
    // if (this.db.concurrencyControl.locks.hasCodeSpecsLock)
    //   throw new Error("has code spec lock");
    // if (this.db.concurrencyControl.channel.isChannelRootLocked)
    //   throw new Error("holds lock on current channel root. it must be released before entering a new channel.");
    if(this.db.locks.holdsExclusiveLock(IModel.dictionaryId)) // I believe will check for whole model?
      throw new Error("holds exclusive lock");
    if(this.db.locks.holdsSharedLock(IModel.dictionaryId))
      throw new Error("holds shared lock");

    // this.db.concurrencyControl.channel.channelRoot = rootId;

    // const reqContext = await this.getAuthReqContext();
    // await this.db.concurrencyControl.channel.lockChannelRoot(reqContext); // Channel not present anymore either, think its handled with other new locking stuff instead but leaving just in case
  }
}

