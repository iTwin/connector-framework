import { BentleyStatus, Guid, GuidString, Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import * as fs from "fs";

interface IArgs {
  isValid(): boolean;
  fromJSON(json: any): any;
}

export class JobArgs implements IArgs {

  public connectorFile: string;
  public source: string;
  public stagingDir: string;
  public revisionHeader: string = "jsfwk";
  public env: "0" | "102" | "103" = "0";
  public dbType: "briefcase" | "snapshot" | "standalone" = "briefcase";
  public badgersDbFile: string = path.join(this.stagingDir, "badgers.db");
  public loggerConfigJSONFile?: string;
  public moreArgs?: { [otherArg: string]: any };
  public doDetectDeletedElements: boolean = true;
  public updateDomainSchemas: boolean = true;
  public updateDbProfile: boolean = true;

  public static fromJSON(json: any): JobArgs {
    const args = new JobArgs();
    args.connectorFile = json.connectorFile;
    args.source = json.source;
    args.stagingDir = json.stagingDir;
    args.revisionHeader = json.revisionHeader ?? args.revisionHeader;
    args.env = json.env ?? args.env;
    args.dbType = json.dbType ?? args.dbType;
    args.badgersDbFile = json.badgersDbFile ?? args.badgersDbFile;
    args.loggerConfigJSONFile = json.loggerConfigJSONFile;
    args.moreArgs = json.moreArgs;
    if ("doDetectDeletedElements" in json)
      args.doDetectDeletedElements = json.doDetectDeletedElements;
    if ("updateDomainSchemas" in json)
      args.updateDomainSchemas = json.updateDomainSchemas;
    if ("updateDbProfile" in json)
      args.updateDbProfile = json.updateDbProfile;
  }

  public isValid() {
    if (!this.connectorFile) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument 'connectorFile' is missing");
      return false;
    }
    if (!existsSync(this.connectorFile)) {
      Logger.logError(ConnectorLoggerCategory.Framework, "file pointed by argument 'connectorFile' does not exist");
      return false;
    }
    if (!this.source) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument 'source' is missing");
      return false;
    }
    if (this.loggerConfigJSONFile && !existsSync(this.loggerConfigJSONFile)) {
      Logger.logError(ConnectorLoggerCategory.Framework, "file pointed by argument 'loggerConfigJSONFile' does not exist");
      return false;
    }
    return true;
  }
}

export class HubArgs implements IArgs {

  public briefcaseFile?: string;
  public briefcaseId?: number;
  public projectGuid: string;
  public iModelGuid: string;
  public clientConfig: NativeAppAuthorizationConfiguration;

  public tokenCallbackUrl?: string;
  public tokenCallback?: async () => Promise<AccessToken>;
  public doInteractiveSignIn: boolean = false;

  public fromJSON(json: any): HubArgs {
    const args = new HubArgs();
    args.briefcaseFile = json.briefcaseFile;
    args.briefcaseId = json.briefcaseId;
    args.projectGuid = json.projectGuid;
    args.iModelGuid = json.iModelGuid;
    args.clientConfig = json.clientConfig;
    args.tokenCallbackUrl = json.tokenCallbackUrl;
    if ("doInteractiveSignIn" in json)
      args.doInteractiveSignIn = json.doInteractiveSignIn;
    return args;
  }

  public isValid() {
    if (!this.briefcaseFile) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument 'briefacseFile' is missing");
      return false;
    }
    if (!existsSync(this.briefcaseFile)) {
      Logger.logError(ConnectorLoggerCategory.Framework, "file pointed by argument 'briefacseFile' does not exist");
      return false;
    }
    if (!this.iModelGuid) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument 'hubIModelGuid' is missing");
      return false;
    }
    if (!this.projectGuid) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument 'hubProjectGuid' is missing");
      return false;
    }
    if (!doInteractiveSignIn && !this.tokenCallbackUrl && !this.tokenCallback) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument either 'tokenCallback' or 'tokenCallbackUrl' must be defined when 'doInteractiveSignIn' is false");
      return false;
    }
    return true;
  }
}

export class PCFArgs implements IArgs {
  public subjectNode: string;
  public loaderNode: string;
  public loaderLazyMode: boolean = false;

  public fromJSON(json: string): PCFArgs {
    const args = new PCFArgs();
    args.subjectNode = json.subjectNode;
    args.loaderNode = json.loaderNode;
    if ("loaderLazyMode" in json)
      args.loaderLazyMode = json.loaderLazyMode;
    return args;
  }

  public isValid() {
    return true;
  }
}


