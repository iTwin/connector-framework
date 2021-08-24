import { IModel, LocalBriefcaseProps, OpenBriefcaseProps, SubjectProps } from "@bentley/imodeljs-common";
import { ChangesType } from "@bentley/imodelhub-client";
import { assert, BentleyStatus, ClientRequestContext, Guid, Id64String, Logger } from "@bentley/bentleyjs-core";
import { BriefcaseDb, BriefcaseManager, IModelDb, NativeHost, RequestNewBriefcaseArg, SnapshotDb, StandaloneDb, Subject, SubjectOwnsSubjects } from "@bentley/imodeljs-backend";
import { ElectronAuthorizationBackend } from "@bentley/electron-manager/lib/ElectronBackend";
import { BaseConnector } from "./BaseConnector";
import { LoggerCategories } from "./LoggerCategory";
import { JobArgs, HubArgs, PCFArgs } from "./Args";
import { AuthorizedClientRequestContext, AccessToken } from "@bentley/itwin-client";
import { Synchronizer } from "./Synchronizer";
import * as fs from "fs";
import * as path from "path";

export class ConnectorRunner {

  private _jobArgs: JobArgs;
  private _hubArgs?: HubArgs;
  private _pcfArgs?: PCFArgs;

  private _db?: IModelDb;
  private _connector?: BaseConnector;
  private _reqContext?: ClientRequestContext | AuthorizedClientRequestContext;

  constructor(jobArgs: JobArgs, hubArgs?: HubArgs, pcfArgs?: PCFArgs) {
    this._jobArgs = jobArgs;
    this._hubArgs = hubArgs;
    this._pcfArgs = pcfArgs;
  }

  public static fromFile(file: string): ConnectorRunner {
    if (fs.existsSync(file))
      throw new Error(`${file} does not exist`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const runner = ConnectorRunner.fromJSON(json);
    return runner;
  }

  public static fromJSON(json: any): ConnectorRunner {
    if (!("jobArgs" in json))
      throw new Error("jobArgs is not defined");
    const jobArgs = new JobArgs(json.jobArgs);
    if (!jobArgs.isValid())
      throw new Error("Invalid jobArgs");

    let hubArgs: HubArgs | undefined = undefined;
    if ("hubArgs" in json) {
      hubArgs = new HubArgs(json.hubArgs);
      if (hubArgs.isValid())
        throw new Error("Invalid hubArgs");
    }

    let pcfArgs: PCFArgs | undefined = undefined;
    if ("pcfArgs" in json) {
      pcfArgs = new PCFArgs(json.pcfArgs);
      if (pcfArgs.isValid())
        throw new Error("Invalid pcfArgs");
    }

    return new ConnectorRunner(jobArgs, hubArgs, pcfArgs);
  }

  public async getAuthReqContext(): Promise<AuthorizedClientRequestContext> {
    if (!this._reqContext || !(this._reqContext instanceof AuthorizedClientRequestContext))
      throw new Error("AuthorizedClientRequestContext has not been loaded.");
    if (this._reqContext.accessToken.isExpired(5)) {
      this._reqContext.accessToken = await this._getToken();
      Logger.logInfo(LoggerCategories.Framework, "AccessToken Refreshed");
    }
    return this._reqContext;
  }

  public async getReqContext(): Promise<ClientRequestContext | AuthorizedClientRequestContext> {
    if (!this._reqContext)
      throw new Error("ConnectorRunner.reqContext has not been loaded.");

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
      throw new Error("ConnectorRunner.hubArgs is not defined.");
    return this._hubArgs;
  }

  public get pcfArgs(): PCFArgs | undefined {
    return this._pcfArgs;
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

  public async synchronize(): Promise<BentleyStatus> {
    let runStatus = BentleyStatus.SUCCESS;
    try {
      await this._synchronize();
    } catch (err) {
      console.log(err);
      // Logger.logError(LoggerCategories.Framework, (err as any).message);
      runStatus = BentleyStatus.ERROR;
      if (this._db && this._db.isBriefcaseDb()) {
        const reqContext = await this.getAuthReqContext();
        await (this._db as BriefcaseDb).concurrencyControl.abandonResources(reqContext);
      }
    } finally {
      if (this._db) {
        this._db.abandonChanges();
        this._db.close();
      }
    }
    return runStatus;
  }

  private async _synchronize() {
    Logger.logInfo(LoggerCategories.Framework, "Connector Job has started");

    let reqContext: ClientRequestContext | AuthorizedClientRequestContext;

    // load

    await this._loadConnector();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.connector has been loaded.");

    await this._loadReqContext();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.reqContext has been loaded.");

    await this._loadDb();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.db has been loaded.");

    await this._loadSynchronizer();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.connector.synchronizer has been loaded.");

    this._initProgressMeter();

    // source data

    Logger.logInfo(LoggerCategories.Framework, "connector.openSourceData started.");
    await this._enterChannel(IModel.repositoryModelId);

    await this.connector.openSourceData(this.jobArgs.source);
    await this.connector.onOpenIModel();

    await this._persistChanges(`Initialization`, ChangesType.Definition);
    Logger.logInfo(LoggerCategories.Framework, "connector.openSourceData ended.");

    // domain schema

    Logger.logInfo(LoggerCategories.Framework, "connector.updateDomainSchema started");
    await this._enterChannel(IModel.repositoryModelId);

    reqContext = await this.getReqContext();
    await this.connector.importDomainSchema(reqContext);

    await this._persistChanges(`Domain Schema Update`, ChangesType.Schema);
    Logger.logInfo(LoggerCategories.Framework, "connector.updateDomainSchema ended");

    // dynamic schema

    Logger.logInfo(LoggerCategories.Framework, "connector.importDynamicSchema started");
    await this._enterChannel(IModel.repositoryModelId);

    reqContext = await this.getReqContext();
    await this.connector.importDynamicSchema(reqContext);

    await this._persistChanges("Dynamic Schema Update", ChangesType.Schema);
    Logger.logInfo(LoggerCategories.Framework, "connector.importDynamicSchema ended");

    // init

    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.updateJobSubject started");
    await this._enterChannel(IModel.repositoryModelId);

    const jobSubject = this._updateJobSubject();

    await this._persistChanges(`Job Subject Update`, ChangesType.GlobalProperties);
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.updateJobSubject ended.");

    // definitions
    
    Logger.logInfo(LoggerCategories.Framework, "connector.importDefinitions started");
    await this._enterChannel(jobSubject.id);

    await this.connector.initializeJob();
    await this.connector.importDefinitions();

    await this._persistChanges("Definitions Update", ChangesType.Regular);
    Logger.logInfo(LoggerCategories.Framework, "connector.importDefinitions ended");

    // data
    
    Logger.logInfo(LoggerCategories.Framework, "connector.updateExistingData started");
    await this._enterChannel(jobSubject.id);

    await this.connector.updateExistingData();
    this._updateDeletedElements();
    this._updateProjectExtent();

    await this._persistChanges("Data Update", ChangesType.Regular);
    Logger.logInfo(LoggerCategories.Framework, "connector.updateExistingData ended");

    Logger.logInfo(LoggerCategories.Framework, "Connector Job has completed");
  }

  private _updateDeletedElements() {
    if (this.jobArgs.doDetectDeletedElements)
      this.connector.synchronizer.detectDeletedElements();
  }

  private _updateProjectExtent() {
    const res = this.db.computeProjectExtents({
      reportExtentsWithOutliers: false,
      reportOutliers: false,
    });
    this.db.updateProjectExtents(res.extents);
  }

  private _updateJobSubject(): Subject {
    let subjectName = this.jobArgs.source;
    if (this.pcfArgs)
      subjectName = this.pcfArgs.subjectNode; 

    const code = Subject.createCode(this.db, IModel.rootSubjectId, subjectName);
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
              ConnectorType: this.pcfArgs ? "PCFConnector" : "JSConnector",
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

      const newSubjectId = this.db.elements.insertElement(subjectProps);
      subject = this.db.elements.getElement<Subject>(newSubjectId);
    }

    this.connector.jobSubject = subject;
    return subject;
  }

  private _initProgressMeter() {}

  private async _loadReqContext() {
    const activityId = Guid.createValue();
    const appId = this.connector.getApplicationId();
    const appVersion = this.connector.getApplicationVersion();
    if (this.jobArgs.dbType === "briefcase") {
      const token = await this._getToken();
      this._reqContext = new AuthorizedClientRequestContext(token, activityId, appId, appVersion);
    } else {
      this._reqContext = new ClientRequestContext();
    }
  }

  private async _getToken() {
    let token: AccessToken;
    if (!this.hubArgs)
      throw new Error("ConnectorRunner._getToken: undefined hubArgs.");
    if (this.hubArgs.doInteractiveSignIn)
      token = await this._getTokenInteractive();
    else
      token = await this._getTokenSilent();
    return token;
  }

  private async _getTokenSilent() {
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

  private async _getTokenInteractive() {
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

  private async _loadDb() {
    if (this.jobArgs.dbType === "briefcase") {
      await this._loadBriefcaseDb();
    } else if (this.jobArgs.dbType === "standalone") {
      this._loadStandaloneDb();
    } else if (this.jobArgs.dbType === "snapshot") {
      this._loadSnapshotDb();
    } else {
      throw new Error("Invalid JobArgs.dbType");
    }
  }

  private async _loadSnapshotDb() {
    const cname = this.connector.getConnectorName();
    const fname = `${cname}.bim`;
    const fpath = path.join(this.jobArgs.stagingDir, fname);
    if (fs.existsSync(fpath))
      fs.unlinkSync(fpath);
    this._db = SnapshotDb.createEmpty(fpath, { rootSubject: { name: cname } });
  }

  private async _loadStandaloneDb() {
    const cname = this.connector.getConnectorName(); 
    const fname = `${cname}.bim`;
    const fpath = path.join(this.jobArgs.stagingDir, fname);
    if (fs.existsSync(fpath))
      this._db = StandaloneDb.openFile(fpath);
    else
      this._db = StandaloneDb.createEmpty(fpath, { rootSubject: { name: cname } });
  }

  private async _loadBriefcaseDb() {

    let bcFile: string | undefined = undefined;
    if (this.hubArgs.briefcaseFile) {
      bcFile = this.hubArgs.briefcaseFile;
    } else {
      const briefcases = BriefcaseManager.getCachedBriefcases(this.hubArgs.iModelGuid);
      console.log("_loadBriefcaseDb:", briefcases);
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
      const reqArg: RequestNewBriefcaseArg = { contextId: this.hubArgs.projectGuid, iModelId: this.hubArgs.iModelGuid };
      if (this.hubArgs.briefcaseId)
        reqArg.briefcaseId = this.hubArgs.briefcaseId;

      const bcProps: LocalBriefcaseProps = await BriefcaseManager.downloadBriefcase(reqContext, reqArg);
      if (this.jobArgs.updateDbProfile || this.jobArgs.updateDomainSchemas)
        await BriefcaseDb.upgradeSchemas(reqContext, bcProps);

      openProps = { fileName: bcProps.fileName };
    }

    this._db = await BriefcaseDb.open(reqContext, openProps);
    (this._db as BriefcaseDb).concurrencyControl.startBulkMode();
  }

  private async _loadConnector() {
    const connectorModule = require(this.jobArgs.connectorFile);
    this._connector = await connectorModule.getConnectorInstance();
  }

  private async _loadSynchronizer() {
    const reqContext = await this.getReqContext();
    const synchronizer = new Synchronizer(this.db, false, reqContext as AuthorizedClientRequestContext);
    this.connector.synchronizer = synchronizer;
  }

  private async _persistChanges(changeDesc: string, ctype: ChangesType) {
    const { revisionHeader } = this.jobArgs;
    const comment = `${revisionHeader} - ${changeDesc}`;
    if (this.db.isBriefcaseDb()) {
      const authReqContext = await this.getAuthReqContext();
      this._db = this.db as BriefcaseDb;
      await this.db.concurrencyControl.request(authReqContext);
      await this.db.pullAndMergeChanges(authReqContext);
      this.db.saveChanges(comment);
      await this.db.pushChanges(authReqContext, comment, ctype);
    } else {
      this.db.saveChanges(comment);
    }
  }

  private async _enterChannel(rootId: Id64String) {
    if (!this.db.isBriefcaseDb())
      return;

    this._db = this.db as BriefcaseDb;
    if (!this.db.concurrencyControl.isBulkMode)
      this.db.concurrencyControl.startBulkMode();
    if (this.db.concurrencyControl.hasPendingRequests)
      throw new Error("has pending requests");
    if (this.db.concurrencyControl.locks.hasSchemaLock)
      throw new Error("has schema lock");
    if (this.db.concurrencyControl.locks.hasCodeSpecsLock)
      throw new Error("has code spec lock");
    if (this.db.concurrencyControl.channel.isChannelRootLocked)
      throw new Error("holds lock on current channel root. it must be released before entering a new channel.");

    this.db.concurrencyControl.channel.channelRoot = rootId;

    const reqContext = await this.getAuthReqContext();
    await this.db.concurrencyControl.channel.lockChannelRoot(reqContext);
  }
}

