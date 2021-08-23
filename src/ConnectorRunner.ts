import { IModel } from "@bentley/imodeljs-common";
import { ChangesType } from "@bentley/imodelhub-client";
import { BentleyStatus } from "@bentley/bentleyjs-core";
import { IModelDb } from "@bentley/imodeljs-backend";
import { ITwinConnector } from "./ITwinConnector";
import { ConnectorLoggerCategory as LoggerCategories } from "./LoggerCategories";
import { JobArgs, HubArgs, PCFArgs } from "./Args";

export class ConnectorRunner {

  public readonly jobArgs: JobArgs;
  public readonly hubArgs?: HubArgs;
  public readonly pcfArgs?: PCFArgs;

  private _db?: IModelDb;
  private _connector?: ITwinConnector;
  private _reqContext?: ClientRequestContext | AuthorizedClientRequestContext;

  constructor(jobArgs: JobArgs, hubArgs?: HubArgs, pcfArgs?: PCFArgs) {
    this.jobArgs = jobArgs;
    this.hubArgs = hubArgs;
    this.pcfArgs = pcfArgs;
  }

  public static fromFile(file: string): ConnectorRunner {
    if (fs.existsSync(file))
      throw new Error(`${file} does not exist`);
    const json = JSON.parse(fs.readFileSync(file));
    const runner = ConnectorRunner.fromJSON(json);
    return runner;
  }

  public static fromJSON(json: any): ConnectorRunner {
    if (!("jobArgs" in json))
      throw new Error("jobArgs is not defined");
    const jobArgs = JobArgs.fromJSON(json.jobArgs);
    if (!jobArgs.isValid());
      throw new Error("Invalid jobArgs");

    let hubArgs: HubArgs | undefined = undefined;
    if ("hubArgs" in json) {
      hubArgs = HubArgs.fromJSON(json.hubArgs);
      if (hubArgs.isValid())
        throw new Error("Invalid hubArgs");
    }

    let pcfArgs: PCFArgs | undefined = undefined;
    if ("pcfArgs" in json) {
      pcfArgs = PCFArgs.fromJSON(json.pcfArgs);
      if (pcfArgs.isValid())
        throw new Error("Invalid pcfArgs");
    }

    return new ConnectorRunner(jobArgs, hubArgs, pcfArgs);
  }

  public async getAuthReqContext(): Promise<AuthorizedClientRequestContext> {
    const reqContext = this._reqContext as AuthorizedClientRequestContext;
    if (!(reqContext instanceof AuthorizedClientRequestContext))
      throw new Error("AuthorizedClientRequestContext has not been loaded.");
    if (reqContext.accessToken.isExpired())
      reqContext.accessToken = await this._getToken();
    return reqContext;
  }

  public async getReqContext(): Promise<ClientRequestContext | AuthorizedClientRequestContext> {
    if (this._db.isBriefcaseDb())
      return await this.getAuthReqContext();
    return this._reqContext;
  }

  public get db(): IModelDb {
    if (!this._db)
      throw new Error("IModelDb has not been loaded.");
    return this._db;
  }

  public get connector(): ITwinConnector {
    if (!this._connector)
      throw new Error("Connector has not been loaded.");
    return this._connector;
  }

  public async synchronize(): Promise<BentleyStatus> {
    let runStatus = BentleyStatus.SUCCESS;
    try {
      await this._synchronize();
    } catch (err) {
      Logger.logError(LoggerCategories.Framework, err.message);
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

    await this._loadReqContext();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.reqContext has been loaded.");

    await this._loadConnector();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.connector has been loaded.");

    await this._loadDb();
    this.db.startBulkMode();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.db has been loaded.");

    await this._loadSynchronizer();
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.connector.synchronizer has been loaded.");

    this._initProgressMeter();

    Logger.logInfo(LoggerCategories.Framework, "connector.openSourceData started.");
    await connector.openSourceData();
    Logger.logInfo(LoggerCategories.Framework, "connector.openSourceData ended.");

    Logger.logInfo(LoggerCategories.Framework, "connector.onOpenIModel started.");
    await connector.onOpenIModel();
    Logger.logInfo(LoggerCategories.Framework, "connector.onOpenIModel ended.");

    Logger.logInfo(LoggerCategories.Framework, "connector.updateDomainSchema started");
    await this._enterChannel(IModel.repositoryModelId);
    await connector.importDomainSchema(reqContext);
    await this._persistChanges(`Domain Schema Update`, ChangesType.Schema);
    Logger.logInfo(LoggerCategories.Framework, "connector.updateDomainSchema ended");

    Logger.logInfo(LoggerCategories.Framework, "connector.importDynamicSchema started");
    await this._enterChannel(IModel.repositoryModelId);
    await connector.importDynamicSchema(reqContext);
    await this._persistChanges("Dynamic Schema Update", ChangesType.Schema);
    Logger.logInfo(LoggerCategories.Framework, "connector.importDynamicSchema ended");

    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner._updateJobSubject started");
    await this._enterChannel(IModel.repositoryModelId);
    this._updateJobSubject();
    await this._persistChanges("Job Subject Update", ChangesType.Schema);
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner._updateJobSubject ended");

    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.updateExistingData started");
    await this._enterChannel(this.jobSubjectId);
    await this.connector.updateExistingData();
    this._updateDeletedElements();
    this._updateProjectExtent();
    await this._persistChanges("Data Update", ChangesType.Regular);
    Logger.logInfo(LoggerCategories.Framework, "ConnectorRunner.updateExistingData ended");

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

  private _updateJobSubject() {
    let subjectName = this.jobArgs.source;
    if (this.pcfArgs)
      subjectName = this.pcfArgs.subjectNode; 

    const code = Subject.createCode(this.db, IModel.rootSubjectId, subjectName);
    const existingSubjectId = this.db.elements.queryElementIdByCode(code);

    let subject: Subject;

    if (existingSubjectId) {
      subject = this.db.elements.getElement<Subject>(existingSubject);
    } else {
      const jsonProperties: any = {
        Subject: {
          Job: {
            Properties: {
              ConnectorVersion: this.connector.getApplicationVersion(),
              ConnectorType: this.pcfArgs ? "PCFConnector" : "JSConnector",
            }
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
  }

  private _initProgressMeter() {}

  private await _loadReqContext() {
    if (db.isBriefcaseDb()) {
      const token = await this._getToken();
      const activityId = Guid.createValue();
      const appId = this.connector.getApplicationId();
      const appVersion = this.connector.getApplicationVersion();
      this._reqContext = new AuthorizedClientRequestContext(token, activityId, appId, appVersion);
    } else {
      this._reqContext = new ClientRequestContext();
    }
  }

  private async _getToken() {
    if (this.hubArgs.interactiveSignIn)
      await this._getTokenInteractive();
    else
      await this._getTokenSilent();
  }

  private async _getTokenSilent() {
    let token: AccessToken;
    if (this.hubArgs && this.hubArgs.accessTokenCallbackUrl) {
      const tokenStr = await fetch(this.hubArgs.accessTokenCallbackUrl);
      token = new AccessToken(tokenStr);
    } else if (this.hubArgs && this.hubArgs.accessTokenCallback) {
      const tokenStr = await this.hubArgs.accessTokenCallback();
      token = new AccessToken(tokenStr);
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
    if (this.jobArgs.dbType === "briefcase")
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
    const cname = this._connector.getConnectorName();
    const fname = `${cname}.bim`;
    const fpath = path.join(this.jobArgs.stagingDir, fname);
    if (fs.existsSync(fpath))
      fs.unlinkSync(fpath);
    this._db = SnapshotDb.createEmpty(fpath, { rootSubject: { name: cname } });
  }

  private async _loadStandaloneDb() {
    const cname = this._connector.getConnectorName(); 
    const fname = `${cname}.bim`;
    const fpath = path.join(this.jobArgs.stagingDir, fname);
    if (fs.existsSync(fpath))
      this._db = StandaloneDb.openFile(fpath);
    else
      this._db = StandaloneDb.createEmpty(fpath, { rootSubject: { name: cname } });
  }

  private async _loadBriefcaseDb() {
    if (this.db.isBriefcase() && this.db.isOpen)
      return;

    let db: BriefcaseDb;
    let props: LocalBriefcaseProps;
    const reqContext = await this.getAuthReqContext();

    const doLoadExisting = this.hubArgs.briefcaseFile || (this.hubArgs.briefcaseId && this.hubArgs.iModelId);
    if (doLoadExisting) {
      const briefcases = BriefcaseManager.getCachedBriefcases(this.hubArgs.iModelId);
      for (const bc as LocalBriefcaseProps of briefcases) {
        assert(bc.iModelId === this.hubArgs.iModelId);
        if (bc.briefcaseId === this.hubArgs.briefcaseId)
          props = bc;
      }
    } else {
      const reqArg: RequestNewBriefcaseArg = { contextId: this.hubArgs.projectGuid, iModelId: this.hubArgs.iModelGuid };
      if (this.hubArgs.briefcaseId)
        reqArg.briefcaseId = this.hubArgs.briefcaseId;
      props = await BriefcaseManager.downloadBriefcase(reqContext, reqArg);
    }

    const openArgs: OpenBriefcaseProps = {
      fileName: props.fileName,
    };

    if (this.jobArgs.updateDbProfile || this.jobArgs.updateDomainSchemas)
      await BriefcaseDb.upgradeSchemas(reqContext, props);

    this._db = await BriefcaseDb.open(reqContext, openArgs);
  }

  private async _loadConnector() {
    const connectorModule = require(this.jobArgs.connectorFile);
    this._connector = await connectorModule.getConnectorInstance();
  }

  private async _loadSynchronizer() {
    const reqContext = await this.getReqContext();
    const synchronizer = new Synchronizer(this._db, false, reqContext);
    this._connector.synchronizer = synchronizer;
  }

  private async _persistChanges(changeDesc: string, ctype: ChangesType) {
    const { revisionHeader } = this.jobArgs;
    const comment = `${revisionHeader} - ${changeDesc}`;
    const reqContext = await this.getAuthReqContext();
    if (this.db.isBriefcaseDb()) {
      this.db = this.db as bk.BriefcaseDb;
      await this.db.concurrencyControl.request(reqContext);
      await this.db.pullAndMergeChanges(reqContext);
      this.db.saveChanges("pullAndMergeChanges");
      await this.db.pushChanges(reqContext, comment, ctype);
    } else {
      this.db.saveChanges(comment);
    }
  }

  private async _enterChannel(rootId: Id64String) {
    if (!this.db.isBriefcaseDb())
      return;

    this.db = this.db as bk.BriefcaseDb;
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

