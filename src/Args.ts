import { Logger } from "@bentley/bentleyjs-core";
import { AccessToken } from "@bentley/itwin-client";
import { NativeAppAuthorizationConfiguration } from "@bentley/imodeljs-common";
import { LoggerCategories } from "./LoggerCategory"
import * as fs from "fs";
import * as path from "path";

interface IArgs {
  isValid(): boolean;
}

export interface JobArgsProps {
  connectorFile: string;
  source: string;
  stagingDir?: string;
  revisionHeader?: string;
  env?: "0" | "102" | "103";
  dbType?: "briefcase" | "snapshot" | "standalone";
  badgersDbFile?: string
  loggerConfigJSONFile?: string;
  moreArgs?: { [otherArg: string]: any };
  doDetectDeletedElements?: string;
  updateDomainSchemas?: string;
  updateDbProfile?: string;
}

export class JobArgs implements IArgs {

  public connectorFile: string;
  public source: string;
  public stagingDir: string = path.join(__dirname, "staging");
  public revisionHeader: string = "JSFWK";
  public env: "0" | "102" | "103" = "0";
  public dbType: "briefcase" | "snapshot" | "standalone" = "briefcase";
  public badgersDbFile?: string
  public loggerConfigJSONFile?: string;
  public moreArgs?: { [otherArg: string]: any };
  public doDetectDeletedElements: boolean = true;
  public updateDomainSchemas: boolean = true;
  public updateDbProfile: boolean = true;

  constructor(props: JobArgsProps) {
    this.connectorFile = props.connectorFile;
    this.source = props.source;
    this.stagingDir = props.stagingDir ?? this.stagingDir;
    this.revisionHeader = props.revisionHeader ?? this.revisionHeader;
    this.env = props.env ?? this.env;
    this.dbType = props.dbType ?? this.dbType;
    this.badgersDbFile = props.badgersDbFile ?? path.join(this.stagingDir, "badgers.db");
    this.loggerConfigJSONFile = props.loggerConfigJSONFile;
    this.moreArgs = props.moreArgs;
    if (props.doDetectDeletedElements !== undefined && props.doDetectDeletedElements.toLowerCase() === "false")
      this.doDetectDeletedElements = false;
    if (props.updateDomainSchemas !== undefined && props.updateDomainSchemas.toLowerCase() === "false")
      this.updateDomainSchemas = false;
    if (props.updateDbProfile !== undefined && props.updateDbProfile.toLowerCase() === "false")
      this.updateDomainSchemas = false;
  }

  public isValid() {
    if (!this.connectorFile) {
      Logger.logError(LoggerCategories.Framework, "JobArgs.connectorFile is missing");
      return false;
    }
    if (!fs.existsSync(path.join(__dirname, this.connectorFile))) {
      Logger.logError(LoggerCategories.Framework, "JobArgs.connectorFile does not exist");
      return false;
    }
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

export interface HubArgsProps {
  briefcaseFile?: string;
  briefcaseId?: string;
  projectGuid: string;
  iModelGuid: string;
  clientConfig: NativeAppAuthorizationConfiguration;
  tokenCallbackUrl?: string;
  doInteractiveSignIn?: string;
}

export class HubArgs implements IArgs {

  public briefcaseFile?: string;
  public briefcaseId?: number;
  public projectGuid: string;
  public iModelGuid: string;
  public clientConfig: NativeAppAuthorizationConfiguration;

  public tokenCallbackUrl?: string;
  public tokenCallback?: () => Promise<AccessToken>;
  public doInteractiveSignIn: boolean = false;

  constructor(json: HubArgsProps) {
    this.briefcaseFile = json.briefcaseFile;
    this.briefcaseId = json.briefcaseId ? parseInt(json.briefcaseId) : undefined;
    this.projectGuid = json.projectGuid;
    this.iModelGuid = json.iModelGuid;
    this.clientConfig = json.clientConfig;
    this.tokenCallbackUrl = json.tokenCallbackUrl;
    if (json.doInteractiveSignIn !== undefined && json.doInteractiveSignIn.toLowerCase() === "true")
      this.doInteractiveSignIn = true;
  }

  public isValid() {
    if (!this.briefcaseFile) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.briefacseFile has invalid value");
      return false;
    }
    if (!fs.existsSync(this.briefcaseFile)) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.briefacseFile does not exist");
      return false;
    }
    if (!this.iModelGuid) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.IModelGuid has invalid value");
      return false;
    }
    if (!this.projectGuid) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.ProjectGuid has invalid value");
      return false;
    }
    if (!this.doInteractiveSignIn && !this.tokenCallbackUrl && !this.tokenCallback) {
      Logger.logError(LoggerCategories.Framework, "HubArgs.tokenCallback or HubArgs.tokenCallbackUrl must be defined if HubArgs.doInteractiveSignIn=false");
      return false;
    }
    return true;
  }
}

