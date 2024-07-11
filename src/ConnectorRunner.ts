/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {IModel, LocalBriefcaseProps, OpenBriefcaseProps, SubjectProps} from "@itwin/core-common";
import {assert, BentleyError, BentleyStatus, Guid, Id64Arg, Id64String, IModelHubStatus, Logger, LogLevel} from "@itwin/core-bentley";
import {BriefcaseDb, BriefcaseManager, ChannelControl, IModelDb, LinkElement, RequestNewBriefcaseArg, SnapshotDb, StandaloneDb, Subject, SubjectOwnsSubjects, SynchronizationConfigLink} from "@itwin/core-backend";
import {BaseConnector} from "./BaseConnector";
import {LoggerCategories} from "./LoggerCategory";
import {AllArgsProps, HubArgs, JobArgs} from "./Args";
import {Synchronizer} from "./Synchronizer";
import {ConnectorIssueReporter} from "./ConnectorIssueReporter";
import * as fs from "fs";
import * as path from "path";
import { SqliteIssueReporter } from "./SqliteIssueReporter";
import {ConnectorAuthenticationManager } from "./ConnectorAuthenticationManager";
import {ChangeSetGroup, IModelHubProxy} from "./ChangeSetGroup";
type Path = string;

enum BeforeRetry { Nothing = 0, PullMergePush = 1 }

export class ConnectorRunner {

  private _jobArgs: JobArgs;
  private _hubArgs?: HubArgs;

  private _db?: IModelDb;
  private _connector?: BaseConnector;
  private _issueReporter?: ConnectorIssueReporter;
  private _authMgr?: ConnectorAuthenticationManager;
  private _changeSetGroup?: ChangeSetGroup;
  private _iModelClient: IModelHubProxy;

  /**
   * @throws Error when jobArgs or/and hubArgs are malformated or contain invalid arguments
   */
  constructor(jobArgs: JobArgs, hubArgs?: HubArgs) {
    if (!jobArgs.isValid)
      throw new Error("Invalid jobArgs");
    this._jobArgs = jobArgs;

    if (hubArgs) {
      if (!hubArgs.isValid)
        throw new Error("Invalid hubArgs");
      this._hubArgs = hubArgs;
    }

    this._iModelClient = new IModelHubProxy();
    this._iModelClient.connect();

    Logger.initializeToConsole();
    const { loggerConfigJSONFile } = jobArgs;
    if (loggerConfigJSONFile && path.extname(loggerConfigJSONFile) === ".json" && fs.existsSync(loggerConfigJSONFile))
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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

    // __PUBLISH_EXTRACT_START__ ConnectorRunner-constructor.example-code
    if (!(json.jobArgs))
      throw new Error("jobArgs is not defined");
    const jobArgs = new JobArgs(json.jobArgs);

    let hubArgs: HubArgs | undefined;
    if (json.hubArgs)
      hubArgs = new HubArgs(json.hubArgs);

    const runner = new ConnectorRunner(jobArgs, hubArgs);
    // __PUBLISH_EXTRACT_END__

    return runner;
  }

  public get jobArgs(): JobArgs {
    return this._jobArgs;
  }

  public get hubArgs(): HubArgs {
    if (!this._hubArgs)
      throw new Error(`ConnectorRunner.hubArgs is not defined for current iModel with type = ${this.jobArgs.dbType}.`);
    return this._hubArgs;
  }

  public set issueReporter(reporter: ConnectorIssueReporter | undefined) {
    this._issueReporter = reporter;
  }

  public get issueReporter(): ConnectorIssueReporter | undefined {
    return this._issueReporter;
  }

  public get jobSubjectName(): string {
    return this.connector.getJobSubjectName(this.jobArgs.source);
  }

  public get channelKey(): string {
    return this.connector.getChannelKey();
  }

  public get usesSharedChannel(): boolean {
    return this.channelKey===ChannelControl.sharedChannelName;
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
  public async run(connector: Path): Promise<BentleyStatus> {
    let runStatus = BentleyStatus.SUCCESS;
    try {
      await this.runUnsafe(connector);
    } catch (err) {
      const msg = (err as any).message;
      Logger.logError(LoggerCategories.Framework, msg);
      Logger.logError(LoggerCategories.Framework, `Failed to execute connector module - ${connector}`);
      this.connector.reportError(this.jobArgs.stagingDir, msg, "ConnectorRunner", "Run", LoggerCategories.Framework);
      runStatus = BentleyStatus.ERROR;
      await this.onFailure(err);
    } finally {
      await this.onFinish();
    }
    return runStatus;
  }

  private async runUnsafe(connector: Path) {
    Logger.logInfo(LoggerCategories.Framework, "Connector job has started");

    // load

    Logger.logInfo(LoggerCategories.Framework, "Loading connector...");
    await this.loadConnector(connector);

    if (this.jobArgs.dbType === "briefcase" && this.hubArgs) {
      Logger.logInfo(LoggerCategories.Framework, "Initializing connector's auth client...");
      await this.initAuthClient(this.hubArgs);
    }

    Logger.logInfo(LoggerCategories.Framework, "Loading issue reporter...");
    this.loadIssueReporter();

    Logger.logInfo(LoggerCategories.Framework, "Retrieving iModel...");
    await this.loadDb();

    Logger.logInfo(LoggerCategories.Framework, "Loading synchronizer...");
    await this.loadSynchronizer();

    Logger.logInfo(LoggerCategories.Framework, "Writing configuration and opening source data...");
    const synchConfig = await this.doInRepositoryChannel(
      async () => {
        const config = this.insertSynchronizationConfigLink();
        this.connector.connectorArgs = this.jobArgs.connectorArgs;
        await this.connector.openSourceData(this.jobArgs.source);
        // ADO# 720780 - have both a synchconfiglink and external source - create the relationship
        this.connector.synchronizer.ensureRootSourceRelationshipExists (config, this.jobArgs.source);
        await this.connector.onOpenIModel();
        return config;
      },
      "Write configuration and open source data.",
    );

    // ***
    // *** NEEDS WORK - this API should be changed - The connector should return
    // *** schema *strings* from both importDomainSchema and importDynamicSchema. The connector should not import them.
    // *** (Or, these two connector methods should be combined into a single method that returns an array of strings.)
    // *** Then ConnectorRunner should get the schema lock and import all schemas in one shot.
    // ***
    Logger.logInfo(LoggerCategories.Framework, "Importing domain schema...");
    await this.doInRepositoryChannel(
      async () => {
        return this.connector.importDomainSchema(await this.getToken());
      },
      "Write domain schema.",
    );

    Logger.logInfo(LoggerCategories.Framework, "Importing dynamic schema...");
    await this.doInRepositoryChannel(
      async () => {
        return this.connector.importDynamicSchema(await this.getToken());
      },
      "Write dynamic schema.",
    );

    Logger.logInfo(LoggerCategories.Framework, "Writing job subject and definitions...");
    const jobSubject = await this.doInRepositoryChannel(
      async () => {
        const job = await this.updateJobSubject();
        await this.connector.initializeJob();
        await this.connector.importDefinitions();
        return job;
      },
      "Write job subject and definitions.",
    );

    if(this.jobArgs.shouldUnmapSource) {
      Logger.logInfo(LoggerCategories.Framework, "Unmapping source data...");
      await this.doInRepositoryChannel(
        async () => {
          await this.connector.unmapSource(this.jobSubjectName);
          this.updateProjectExtent();
        },
        "Unmapping source data",
      );
      return;
    }

    Logger.logInfo(LoggerCategories.Framework, "Synchronizing...");
    await this.doInConnectorChannel(jobSubject.id,
      async () => {
        await this.connector.updateExistingData();
        this.updateDeletedElements();
      },
      "Synchronize.",
    );

    Logger.logInfo(LoggerCategories.Framework, "Writing job finish time and extent...");
    await this.doInRepositoryChannel(
      async () => {
        this.updateProjectExtent();
        this.connector.synchronizer.updateRepositoryLinks();
        this.updateSynchronizationConfigLink(synchConfig);
      },
      "Write synchronization finish time and extent.",
    );

    await this.closeChangeSetGroup();

    Logger.logInfo(LoggerCategories.Framework, "Connector job complete!");
  }

  private async closeChangeSetGroup() {
    if (this._changeSetGroup) {
      Logger.logInfo(LoggerCategories.Framework, `Closing ChangeSetGroup ${this._changeSetGroup.id}`);
      await IModelHubProxy.closeChangeSetGroup(this.hubArgs.iModelGuid, this._changeSetGroup.id);
      this._changeSetGroup = undefined;
    }
  }

  private async onFailure(err: any) {
    try {
      if (this._db && this._db.isBriefcaseDb()) {
        this._db.abandonChanges();
        await this.db.locks.releaseAllLocks();
      }
    } catch (err1) {
      // don't allow a further exception to prevent onFailure from reporting and returning. We need to finish the abend sequence.
      // eslint-disable-next-line no-console
      console.error(err1);
    } finally {
      try {
        this.recordError(err);
      } catch (err2) {
        // eslint-disable-next-line no-console
        console.error(err2);
      }
    }
  }

  public recordError(err: any) {
    const errorFile = this.jobArgs.errorFile;
    const errorStr = JSON.stringify({
      id: this._connector?.getConnectorName() ?? "",
      message: "Failure",
      description: err.message,
      extendedData: err,
    });
    fs.writeFileSync(errorFile, errorStr);
    Logger.logInfo(LoggerCategories.Framework, `Error recorded at ${errorFile}`);
  }

  private async onFinish() {
    if (this._db) {
      this._db.abandonChanges();

      this.connector?.onClosingIModel?.();

      this._db.close();
    }

    if (this.issueReporter) {
      await this.issueReporter.publishReport();
      await this.issueReporter.close();
    }
  }

  private updateDeletedElements() {
    if (this.connector.shouldDeleteElements())
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
      /* eslint-disable @typescript-eslint/naming-convention */
      const jsonProperties: any = {
        Subject: {
          Job: {
            // Properties contain bridge instead of connector to keep backwards compatibility
            Properties: {
              BridgeVersion: this.connector.getApplicationVersion(),
              BridgeType: "JSConnector",
            },
            Bridge: this.connector.getConnectorName(),
          },
        },
      };
      /* eslint-disable @typescript-eslint/naming-convention */

      const root = this.db.elements.getRootSubject();
      const subjectProps: SubjectProps = {
        classFullName: Subject.classFullName,
        model: root.model,
        code,
        jsonProperties,
        parent: new SubjectOwnsSubjects(root.id),
      };

      const newSubjectId = this.db.elements.insertElement(subjectProps);

      if (!this.usesSharedChannel)
        this.db.channels.makeChannelRoot({elementId: newSubjectId, channelKey: this.channelKey});

      subject = this.db.elements.getElement<Subject>(newSubjectId);
      // await this.db.locks.releaseAllLocks();
    }

    this.connector.jobSubject = subject;
    this.connector.synchronizer.jobSubjectId = subject.id;
    return subject;
  }

  private async loadConnector(connector: Path) {
    // TODO: Using `require` in a library isn't ergonomic. See
    // https://github.com/iTwin/connector-framework/issues/40.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this._connector = await require(connector).default.create();
  }

  private insertSynchronizationConfigLink() {
    let synchConfigData = {
      classFullName: SynchronizationConfigLink.classFullName,
      model: IModel.repositoryModelId,
      code: LinkElement.createCode(this.db, IModel.repositoryModelId, "SynchConfig"),
    };
    if (this.jobArgs.synchConfigFile) {
      synchConfigData = require(this.jobArgs.synchConfigFile);
    }
    const prevSynchConfigId = this.db.elements.queryElementIdByCode(
      LinkElement.createCode(this.db, IModel.repositoryModelId, "SynchConfig"),
    );
    let idToReturn: string;
    if (prevSynchConfigId === undefined) {
      idToReturn = this.db.elements.insertElement(synchConfigData);
    } else {
      this.updateSynchronizationConfigLink(prevSynchConfigId);
      idToReturn = prevSynchConfigId;
    }
    return idToReturn;
  }
  private updateSynchronizationConfigLink(synchConfigId: string) {
    const synchConfigData = {
      id: synchConfigId,
      classFullName: SynchronizationConfigLink.classFullName,
      model: IModel.repositoryModelId,
      code: LinkElement.createCode(this.db, IModel.repositoryModelId, "SynchConfig"),
      lastSuccessfulRun: Date.now().toString(),
    };
    this.db.elements.updateElement(synchConfigData);
  }

  private loadIssueReporter() {
    if (this.issueReporter) {
      this.connector.issueReporter = this.issueReporter;
      return;
    }

    if (!this.jobArgs.activityId)
      this.jobArgs.activityId = Guid.createValue();

    let contextId;
    let iModelId;
    if (this.jobArgs.dbType === "briefcase") {
      contextId = this.hubArgs.projectGuid;
      iModelId = this.hubArgs.iModelGuid;
    } else {
      contextId = "";
      iModelId = "";
    }

    this.issueReporter = new SqliteIssueReporter(contextId, iModelId, this.jobArgs.activityId, this.jobArgs.source, this.jobArgs.issuesDbDir);
    this.connector.issueReporter = this.issueReporter;
  }

  private needsToken(): boolean {
    const kind = this._jobArgs.dbType;
    return ((kind === "snapshot" || kind === "standalone") ? false : true);
  }

  private async getToken() {
    if (this.needsToken()){
      if (this._authMgr === undefined)
        throw new Error("Unable to get access token - authentication manager is undefined.");
      else
        return this._authMgr.getAccessToken();
    } else {
      return "notoken";
    }
  }

  private async initAuthClient(hubArgs: HubArgs): Promise<string> {
    if (!this._connector || !this.needsToken())
      return "notoken";

    let clientConfig;
    let callbackUrl;
    let callback;

    if (hubArgs.doInteractiveSignIn)
      clientConfig = hubArgs.clientConfig;
    else if (hubArgs.tokenCallbackUrl)
      callbackUrl = hubArgs.tokenCallbackUrl!;
    else if (hubArgs.tokenCallback)
      callback = hubArgs.tokenCallback;
    else {
      throw new Error("Define hubArgs.clientConfig, HubArgs.acccessTokenCallbackUrl or HubArgs.accessTokenCallback to initialize the connector's auth client!");
    }

    this._authMgr = new ConnectorAuthenticationManager ({callback , callbackUrl , authClientConfig : clientConfig});
    await this._authMgr.initialize();
    return this._authMgr.getAccessToken();
  }

  private async loadDb() {
    if (this.jobArgs.dbType === "briefcase") {
      await this.loadBriefcaseDb();
    } else if (this.jobArgs.dbType === "standalone") {
      await this.loadStandaloneDb();
    } else if (this.jobArgs.dbType === "snapshot") {
      await this.loadSnapshotDb();
    } else {
      throw new Error("Invalid JobArgs.dbType");
    }
    this.db.channels.addAllowedChannel(this.channelKey);
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

    let bcFile: string | undefined;
    if (this.hubArgs.briefcaseFile) {
      Logger.logInfo(LoggerCategories.Framework, `Use briefcase file passed with HubArgs: ${this.hubArgs.briefcaseFile}.`);
      bcFile = this.hubArgs.briefcaseFile;
    } else {
      const briefcases = BriefcaseManager.getCachedBriefcases(this.hubArgs.iModelGuid);
      let cbcCount = 0;
      if (briefcases !== undefined)
        cbcCount = briefcases.length;
      Logger.logInfo(LoggerCategories.Framework, `Looking for iModel GUID ${this.hubArgs.iModelGuid} among ${cbcCount} cached briefcases.`);
      for (const bc of briefcases) {
        Logger.logInfo(LoggerCategories.Framework, `Current cached briefcase has iModel GUID ${bc.iModelId}.`);
        assert(bc.iModelId === this.hubArgs.iModelGuid);
        if (this.hubArgs.briefcaseId && bc.briefcaseId !== this.hubArgs.briefcaseId)
          continue;
        bcFile = bc.fileName;
        Logger.logInfo(LoggerCategories.Framework, `Briefcase found in cache - using file name ${bcFile}.`);
        break;
      }
    }

    let openProps: OpenBriefcaseProps;
    if (bcFile) {
      openProps = { fileName: bcFile };
    } else {
      const reqArg: RequestNewBriefcaseArg = { iTwinId: this.hubArgs.projectGuid, iModelId: this.hubArgs.iModelGuid };
      Logger.logInfo(LoggerCategories.Framework, `Briefcase not found in cache - requesting new briefcase from project (iTwin) ${reqArg.iTwinId} with iModel id ${reqArg.iModelId}.`);
      if (this.hubArgs.briefcaseId)
        reqArg.briefcaseId = this.hubArgs.briefcaseId;

      const bcProps: LocalBriefcaseProps = await BriefcaseManager.downloadBriefcase(reqArg);

      if (bcProps !== undefined)
        Logger.logInfo(LoggerCategories.Framework, `A new briefcase with id = ${bcProps.briefcaseId} and name = ${bcProps.fileName} was successfully downloaded.`);

      if (this.jobArgs.updateDbProfile || this.jobArgs.updateDomainSchemas) {
        await this.doWithRetries(async () => BriefcaseDb.upgradeSchemas(bcProps), BeforeRetry.Nothing);
      }

      openProps = { fileName: bcProps.fileName };
    }

    Logger.logInfo(LoggerCategories.Framework, `Attempting to open the briefcase db...`);
    this._db = await BriefcaseDb.open(openProps);

    if (this._db !== undefined)
      Logger.logInfo(LoggerCategories.Framework, `Successfully opened the briefcase db.`);
    else
      throw new Error(`Failed to open briefcase with file name ${openProps.fileName}`);
    // (this._db as BriefcaseDb).concurrencyControl.startBulkMode(); // not sure what/if anything is the new "startBulkMode"
  }

  private async loadSynchronizer() {
    const ddp = this.connector.getDeletionDetectionParams();
    const synchronizer = new Synchronizer(this.db, ddp.fileBased , await this.getToken(), ddp.scopeToPartition, this.connector.getChannelKey(), this._authMgr);
    this.connector.synchronizer = synchronizer;
  }

  /**
   * Fetches the group id of the changeset
   * @param description of grouped changeset
   * @returns the group id of the changeset
   */
  private async fetchChangeSetGroupId(description: string): Promise<string> {
    const enableChangeSetGrouping: boolean = this._connector?.createChangeSetGroup() ?? false;

    if (!enableChangeSetGrouping)
      return "";

    if (this._changeSetGroup)
      return this._changeSetGroup.id;

    if (!this._iModelClient.connected)
      return "";

    IModelHubProxy.token = await this.getToken();
    // NEEDSWORK: don't hardcode the host name here.
    IModelHubProxy.hostName = `https://qa-api.bentley.com`;
    this._changeSetGroup = await IModelHubProxy.createChangeSetGroup(description, this.hubArgs.iModelGuid);
    if (!this._changeSetGroup)
      return "";

    return this._changeSetGroup.id;
  }

  private async persistChanges(changeDesc: string) {
    const { revisionHeader } = this.jobArgs;
    const comment = `${revisionHeader} - ${changeDesc}`;
    const isStandalone = this.jobArgs.dbType === "standalone";
    if (!isStandalone && this.db.isBriefcaseDb()) {
      this._db = this.db;
      await this.db.pullChanges();
      const chgSetGrpId = await this.fetchChangeSetGroupId (comment);
      Logger.logInfo(LoggerCategories.Framework, `Pushing changes to iModelHub with changeset group id ${chgSetGrpId}`);
      this.db.saveChanges(comment);
      await this.db.pushChanges({ description: comment });
      await this.db.locks.releaseAllLocks(); // in case there were no changes
    } else {
      this.db.saveChanges(comment);
    }
  }

  private async acquireLocks(arg: { shared?: Id64Arg, exclusive?: Id64Arg }): Promise<void> {
    const isStandalone = this.jobArgs.dbType === "standalone";
    if (isStandalone || !this.db.isBriefcaseDb())
      return;

    return this.doWithRetries(async () => this.db.locks.acquireLocks(arg), BeforeRetry.PullMergePush);
  }

  private shouldRetryAfterError(err: unknown): boolean {
    if (!(err instanceof BentleyError))
      return false;
    return err.errorNumber === IModelHubStatus.LockOwnedByAnotherBriefcase;
  }

  private async doWithRetries(task: () => Promise<void>, beforeRetry: BeforeRetry): Promise<void> {
    let count = 0;
    do {
      try {
        await task();
        return;
      } catch (err) {
        if (!this.shouldRetryAfterError(err))
          throw err;
        if (++count > this.hubArgs.maxLockRetries)
          throw err;
        const sleepms = Math.random() * this.hubArgs.maxLockRetryWaitSeconds * 1000;
        await new Promise((resolve) => setTimeout(resolve, sleepms));

        if (beforeRetry === BeforeRetry.PullMergePush) {
          assert(this.db.isBriefcaseDb());
          await this.db.pullChanges(); // do not catch!
          await this.db.pushChanges({ description: "" }); // "
        }
      }
    } while (true);
  }

  private async doInRepositoryChannel<R>(task: () => Promise<R>, message: string): Promise<R> {
    await this.acquireLocks({ exclusive: IModel.rootSubjectId });
    const result = await task();
    await this.persistChanges(message);
    return result;
  }

  private async doInConnectorChannel<R>(jobSubject: Id64String, task: () => Promise<R>, message: string): Promise<R> {
    await this.acquireLocks({ exclusive: jobSubject });  // automatically acquires shared lock on root subject (the parent/model)
    const result = await task();
    await this.persistChanges(message);
    return result;
  }
}
