import { IModel } from "@bentley/imodeljs-common";
import { ChangesType } from "@bentley/imodelhub-client";
import { BentleyStatus } from "@bentley/bentleyjs-core";
import { IModelDb } from "@bentley/imodeljs-backend";
import { ITwinConnector } from "./ITwinConnector";
import { ConnectorLoggerCategory } from "./ConnectorLoggerCategory";

export class ConnectorRunner {

  public readonly jobArgs: JobArgs;
  public readonly hubArgs: HubArgs;

  private _db?: IModelDb;
  private _connector?: ITwinConnector;
  private _authReqContext?: AuthorizedClientRequestContext;

  constructor(jobArgs: JobArgs, hubArgs?: HubArgs) {
    this.jobArgs = jobArgs;
    this.hubArgs = hubArgs;
  }

  public async synchronize(): Promise<BentleyStatus> {
    try {
      await this._synchronize();
    } catch (err) {
      Logger.logError(ConnectorLoggerCategory.Framework, err.message);
      return BentleyStatus.ERROR;
    }

    return BentleyStatus.SUCCESS;
  }

  /*
   * 1. connector.openSourceData()
   * 2. connector.onOpenIModel()
   * 3. connector.importDomainSchema() (pushes change set)
   * 4. connector.importDynamicShema() (pushes change set)
   * 5. connector.importDynamicShema()
   */
  private async _synchronize() {
    Logger.logInfo(ConnectorLoggerCategory.Framework, "Connector Job has started");

    await this._loadConnector();
    await this._loadDb();

    this._initProgressMeter();

    await connector.openSourceData();
    await connector.onOpenIModel();

    if (db.isBriefcaseDb()) {
      const activityId = Guid.createValue();
      reqContext = new AuthorizedClientRequestContext(token, activityId, connector.getApplicationId(), connector.getApplicationVersion());
    } else {
      reqContext = new ClientRequestContext();
    }

    Logger.logInfo(ConnectorLoggerCategory.Framework, "updateDomainSchema started");
    await this._enterChannel(IModel.repositoryModelId);
    await connector.importDomainSchema(reqContext);
    await this._persistChanges(`Domain Schema Update`, ChangesType.Schema);
    Logger.logInfo(ConnectorLoggerCategory.Framework, "updateDomainSchema ended");

    Logger.logInfo(ConnectorLoggerCategory.Framework, "importDynamicSchema started");
    await this._enterChannel(IModel.repositoryModelId);
    await connector.importDynamicSchema(reqContext);
    await this._persistChanges("Dynamic Schema Update", ChangesType.Schema);
    Logger.logInfo(ConnectorLoggerCategory.Framework, "importDynamicSchema ended");

    Logger.logInfo(ConnectorLoggerCategory.Framework, "");
    await this._enterChannel(IModel.repositoryModelId);

    await this._persistChanges("Subject Update", ChangesType.Schema);
    Logger.logInfo(ConnectorLoggerCategory.Framework, "");

    Logger.logInfo(ConnectorLoggerCategory.Framework, "");
    await this._enterChannel(this.jobSubjectId);

    await this._persistChanges("Data Update", ChangesType.Regular);
    Logger.logInfo(ConnectorLoggerCategory.Framework, "");

    Logger.logInfo(ConnectorLoggerCategory.Framework, "Connector Job has completed");
  }

  private async getReqContext() {
    if (this._db.isBriefcaseDb()) {
      
    }
    return new ClientRequestContext()
  }

  private findJob(): Subject | undefined {
    assert(this._imodel !== undefined);
    const jobCode = Subject.createCode(this._imodel, IModel.rootSubjectId, this._jobSubjectName);
    const subjectId = this._imodel.elements.queryElementIdByCode(jobCode);
    if (undefined === subjectId) {
      return undefined;
    }
    return this._imodel.elements.tryGetElement<Subject>(subjectId);
  }

  private insertJobSubject(): Subject {
    assert(this._imodel !== undefined);
    const connectorProps: any = {};
    connectorProps.ConnectorVersion = this._connector.getApplicationVersion();
    /// connectorProps.ConnectorType = ???;

    const jobProps: any = {};
    jobProps.Properties = connectorProps;
    jobProps.Connector = this._connector.getConnectorName();
    // jobProps.Comments = ???;

    const subjProps: any = {};
    subjProps.Subject = {};
    subjProps.Subject.Job = jobProps;

    const root = this._imodel.elements.getRootSubject();
    const jobCode = Subject.createCode(this._imodel, root.id, this._jobSubjectName);

    const subjectProps: SubjectProps = {
      classFullName: Subject.classFullName,
      model: root.model,
      code: jobCode,
      jsonProperties: subjProps,
      parent: new SubjectOwnsSubjects(root.id),
    };
    const id = this._imodel.elements.insertElement(subjectProps);
    const subject = this._imodel.elements.getElement<Subject>(id);

    return subject;
  }

  private initProgressMeter() {}

  private async _loadDb() {
    if (this.hubArgs) {
      await this._loadBriefcaseDb();
      return;
    }
  }

  private async _loadSnapshotDb() {}
  private async _loadStandaloneDb() {}

  private async _loadBriefcaseDb() {

    let db: BriefcaseDb;
    let props: LocalBriefcaseProps;

    const doLoadExisting = this.hubArgs.briefcaseFile || (this.hubArgs.briefcaseId && this.hubArgs.iModelId);
    if (doLoadExisting) {
      const briefcases = BriefcaseManager.getCachedBriefcases(this.hubArgs.iModelId);
      for (const bc as LocalBriefcaseProps of briefcases) {
        assert(bc.iModelId === this.hubArgs.iModelId);
        if (bc.briefcaseId === this.hubArgs.briefcaseId)
          props = bc;
      }
    }
        props = await BriefcaseManager.downloadBriefcase(this._requestContext, { briefcaseId: this._connectorArgs.argsJson.briefcaseId, contextId: this._serverArgs.contextId, iModelId: this._serverArgs.iModelId });

    const openArgs: OpenBriefcaseProps = {
      fileName: props.fileName,
    };

    if (!db) {
    }
  }

  private async _loadConnector() {
    const connectorModule = require(this.jobArgs.connectorFile);
    this._connector = await connectorModule.getConnectorInstance();
  }

  private async _persistChanges(changeDesc: string, ctype: ChangesType) {
    const { revisionHeader } = this.jobArgs;
    const comment = `${revisionHeader} - ${changeDesc}`;
    if (this.db.isBriefcaseDb()) {
      await (this.db as bk.BriefcaseDb).concurrencyControl.request(this.authReqContext);
      await (this.db as bk.BriefcaseDb).pullAndMergeChanges(this.authReqContext);
      this.db.saveChanges(comment);
      await (this.db as bk.BriefcaseDb).pushChanges(this.authReqContext, comment, ctype); // not atomic
    } else {
      this.db.saveChanges(comment);
    }
  }

  private async _enterChannel(rootId: Id64String) {
    if (!this.db.isBriefcaseDb())
      return;
    if (!(this.db as bk.BriefcaseDb).concurrencyControl.isBulkMode)
      (this.db as bk.BriefcaseDb).concurrencyControl.startBulkMode();
    if ((this.db as bk.BriefcaseDb).concurrencyControl.hasPendingRequests)
      throw new Error("has pending requests");
    if ((this.db as bk.BriefcaseDb).concurrencyControl.locks.hasSchemaLock)
      throw new Error("has schema lock");
    if ((this.db as bk.BriefcaseDb).concurrencyControl.locks.hasCodeSpecsLock)
      throw new Error("has code spec lock");
    if ((this.db as bk.BriefcaseDb).concurrencyControl.channel.isChannelRootLocked)
      throw new Error("holds lock on current channel root. it must be released before entering a new channel.");
    (this.db as bk.BriefcaseDb).concurrencyControl.channel.channelRoot = rootId;
    await (this.db as bk.BriefcaseDb).concurrencyControl.channel.lockChannelRoot(this.authReqContext);
  }
}



