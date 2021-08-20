import { BentleyStatus, Guid, GuidString, Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import * as fs from "fs";

export class JobArgs {

  public connectorFile: string;
  public source: string;
  public revisionHeader: string = "jsfwk";
  public env: "0" | "102" | "103" = "0";
  public badgersDbFile: string = path.join(__dirname, "badgers.db");
  public loggerConfigJSONFile?: string;
  public moreArgs?: { [otherArg: string]: any };

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

export class HubArgs {

  public briefcaseFile?: string;
  public briefcaseId?: number;
  public iModelGuid: string;
  public projectGuid: string;
  public accessTokenCallbackUrl: string;

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
    if (!this.accessTokenCallbackUrl) {
      Logger.logError(ConnectorLoggerCategory.Framework, "argument 'accessTokenCallbackUrl' is missing");
      return false;
    }
    return true;
  }
}

/*

export class CliArgs {
  public static fromFile(filepath: string) {
    const args = new CliArgs();
    const obj = JSON.parse(fs.readFileSync(filepath));
    args.connectorFile = obj.connectorFile;
    args.source = obj.source;
    args.revisionHeader = obj.revisionHeader ?? args.revisionHeader;
    args.env = obj.env ?? args.env;
    args.briefcaseFile = obj.briefcaseFile;
    args.briefcaseId = obj.briefcaseId ?? undefined;
    args.badgersDbFile = obj.briefcaseId ?? undefined;
  }
  public isValid() {
    if (!this.connectorFile) {
      Logger.logError(ConnectorLoggerCategory.Framework, "Missing argument - connectorFile");
      return false;
    }
    if (!existsSync(this.connectorFile)) {
      Logger.logError(ConnectorLoggerCategory.Framework, "connectorFile does not exist");
      return false;
    }
    if (!obj.source) {
      Logger.logError(ConnectorLoggerCategory.Framework, "connectorFile does not exist");
      return false;
    }
  }
}

*/

