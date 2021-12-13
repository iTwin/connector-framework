import { Logger } from "@bentley/bentleyjs-core";
import { AccessToken } from "@bentley/itwin-client";
import { NativeAppAuthorizationConfiguration } from "@bentley/imodeljs-common";
import { LoggerCategories } from "./LoggerCategory"
import * as fs from "fs";
import * as path from "path";

interface Validatable {
  isValid(): boolean;
}

/**
 * Defines the schema of the .json argument file used to initialize ConnectorRunner
 */
export interface AllArgsProps {
  version: "0.0.1",
  jobArgs: JobArgsProps;
  hubArgs?: HubArgsProps;
}

export interface JobArgsProps {
  source: string;
  stagingDir?: string;
  revisionHeader?: string;
  dbType?: "briefcase" | "snapshot" | "standalone";
  issuesDbFile?: string
  loggerConfigJSONFile?: string;
  synchConfigFile?: string;
  errorFile?: string;
  moreArgs?: { [otherArg: string]: any };
}

/**
 * Arguments specific to a connector job
 */
export class JobArgs implements JobArgsProps, Validatable {

  public source: string;
  public stagingDir: string = path.join(__dirname, "staging");
  public revisionHeader: string = "JSFWK";
  public dbType: "briefcase" | "snapshot" | "standalone" = "briefcase";
  public issuesDbFile?: string
  public loggerConfigJSONFile?: string;
  public errorFile: string;
  public doDetectDeletedElements: boolean = true;
  public updateDomainSchemas: boolean = true;
  public updateDbProfile: boolean = true;
  public synchConfigFile?: string;
  public moreArgs?: { [otherArg: string]: any };

  constructor(props: JobArgsProps) {
    this.source = props.source;
    this.stagingDir = props.stagingDir ?? this.stagingDir;
    this.revisionHeader = props.revisionHeader ?? this.revisionHeader;
    this.dbType = props.dbType ?? this.dbType;
    this.issuesDbFile = props.issuesDbFile ?? path.join(this.stagingDir, "issues.db");
    this.loggerConfigJSONFile = props.loggerConfigJSONFile;
    this.moreArgs = props.moreArgs;
    this.errorFile = props.errorFile ?? path.join(this.stagingDir, "error.json");
    this.synchConfigFile = props.synchConfigFile;
  }

  public isValid() {
    if (!this.source) {
      Logger.logError(LoggerCategories.Framework, "JobArgs.source is missing");
      return false;
    }
    if (this.loggerConfigJSONFile && !fs.existsSync(this.loggerConfigJSONFile)) {
      Logger.logError(LoggerCategories.Framework, "JobArgs.loggerConfigJSONFile does not exist");
      return false;
    }
    return true;
  }
}

export type ConnectRegion = "0" | "102" | "103";

export interface HubArgsProps {
  briefcaseFile?: string;
  briefcaseId?: number;
  projectGuid: string;
  iModelGuid: string;
  region?: ConnectRegion;
  tokenCallbackUrl?: string;
  doInteractiveSignIn?: boolean;
}

/**
 * Arguments specific to iModelHub used in a connector job 
 */
export class HubArgs implements HubArgsProps, Validatable {

  public briefcaseFile?: string;
  public briefcaseId?: number;
  public projectGuid: string;
  public iModelGuid: string;
  public region: ConnectRegion = "0";
  public clientConfig?: NativeAppAuthorizationConfiguration;

  public tokenCallbackUrl?: string;
  public tokenCallback?: () => Promise<AccessToken>;
  public doInteractiveSignIn: boolean = false;

  constructor(props: HubArgsProps) {
    this.briefcaseFile = props.briefcaseFile;
    this.briefcaseId = props.briefcaseId;
    this.projectGuid = props.projectGuid;
    this.iModelGuid = props.iModelGuid;
    this.region = props.region ?? this.region;
    this.tokenCallbackUrl = props.tokenCallbackUrl;
    if (props.doInteractiveSignIn !== undefined)
      this.doInteractiveSignIn = props.doInteractiveSignIn;
  }

  public isValid() {
    if (this.briefcaseFile && !fs.existsSync(this.briefcaseFile)) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.briefcaseFile does not exist");
      return false;
    }
    if (!this.iModelGuid) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.iModelGuid is not defined or has invalid value");
      return false;
    }
    if (!this.projectGuid) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.projectGuid is not defined or has invalid value");
      return false;
    }
    if (this.doInteractiveSignIn && !this.clientConfig) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.clientConfig must be defined if HubArgs.doInteractiveSignIn=true");
      return false;
    }
    if (!this.doInteractiveSignIn && !this.tokenCallbackUrl && !this.tokenCallback) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.tokenCallback or HubArgs.tokenCallbackUrl must be defined if HubArgs.doInteractiveSignIn=false");
      return false;
    }
    return true;
  }
}

// BankArgs for iTwin Stack / iModel Bank is still WIP
interface BankArgsProps {}

/**
 * Arguments specific to iModel Bank used in a connector job 
 */
class BankArgs {}

