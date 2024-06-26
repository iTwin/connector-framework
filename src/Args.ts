/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {AccessToken, Logger} from "@itwin/core-bentley";
import {NodeCliAuthorizationConfiguration} from "@itwin/node-cli-authorization";
import {LoggerCategories} from "./LoggerCategory";
import * as fs from "fs";
import * as path from "path";

interface Validatable {
  isValid: boolean;
}

/**
 * Defines the schema of the .json argument file used to initialize ConnectorRunner
 */
export interface AllArgsProps {
  version: "0.0.1";
  jobArgs: JobArgsProps;
  hubArgs?: HubArgsProps;
}

export interface JobArgsProps {
  source: string;
  stagingDir?: string;
  revisionHeader?: string;
  dbType?: "briefcase" | "snapshot" | "standalone";
  activityId?: string;
  issuesDbDir?: string;
  loggerConfigJSONFile?: string;
  synchConfigFile?: string;
  errorFile?: string;
  shouldUnmapSource?: boolean;
  connectorArgs?: { [otherArg: string]: any };
}

/**
 * Arguments specific to a connector job
 */
export class JobArgs implements JobArgsProps, Validatable {
  /** Source File
   */
  public source: string;
  /** Staging Directory
   */
  public stagingDir: string = path.join(__dirname, "staging");
  /** Revision Header
   */
  public revisionHeader: string = "JSFWK";
  /** Database Type
   */
  public dbType: "briefcase" | "snapshot" | "standalone" = "briefcase";
  /** Activity Id
   */
  public activityId?: string;
  /** Issues Database Directory (optional)
   */
  public issuesDbDir?: string;
  /** Logger Configuration File (optional)
   */
  public loggerConfigJSONFile?: string;
  /** Error File
   */
  public errorFile: string;
  /** Pass true to update the domain schemas
   */
  public updateDomainSchemas: boolean = true;
  /** Pass true to update db profile
   */
  public updateDbProfile: boolean = true;
  /** Synchronization Config File (optional)
   */
  public synchConfigFile?: string;
  /** Pass true to unmap the source file (optional)
   */
  public shouldUnmapSource?: boolean = false;
  /** Arguments to be passed through to Connector (optional)
   */
  public connectorArgs?: { [otherArg: string]: any };

  constructor(props: JobArgsProps) {
    this.source = props.source;
    this.stagingDir = props.stagingDir ?? this.stagingDir;
    this.revisionHeader = props.revisionHeader ?? this.revisionHeader;
    this.dbType = props.dbType ?? this.dbType;
    this.activityId = props.activityId;
    this.issuesDbDir = props.issuesDbDir;
    this.loggerConfigJSONFile = props.loggerConfigJSONFile;
    this.connectorArgs = props.connectorArgs;
    this.errorFile = props.errorFile ?? path.join(this.stagingDir, "error.json");
    this.synchConfigFile = props.synchConfigFile;
    this.shouldUnmapSource = props.shouldUnmapSource;
  }

  public get isValid() {
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
  maxLockRetries?: number;
  maxLockRetryWaitSeconds?: number;
}

/**
 * Arguments specific to iModelHub used in a connector job
 */
export class HubArgs implements HubArgsProps, Validatable {
  /** Briefcase File
   */
  public briefcaseFile?: string;
  /** Briefcase Id (optional)
   */
  public briefcaseId?: number;
  /** Project Guid
   */
  public projectGuid: string;
  /** iModel Guid
   */
  public iModelGuid: string;
  /** Connect Region  "0" | "102" | "103"
   */
  public region: ConnectRegion = "0";
  /** Node Cli Authorization Configuration (optional)
   */
  public clientConfig?: NodeCliAuthorizationConfiguration;
  /** Token Callback Url (optional)
   */
  public tokenCallbackUrl?: string;
  /** Token Callback (optional)
   */
  public tokenCallback?: () => Promise<AccessToken>;
  /** Whether or not to require input from user to authenticate
   */
  public doInteractiveSignIn: boolean = false;
  /** Number of attempts to obtain a lock before failing
   */
  public maxLockRetries = 3;
  /** Number of seconds to wait before retrying to obtain lock
   */
  public maxLockRetryWaitSeconds = 5;

  constructor(props: HubArgsProps) {
    this.briefcaseFile = props.briefcaseFile;
    this.briefcaseId = props.briefcaseId;
    this.projectGuid = props.projectGuid;
    this.iModelGuid = props.iModelGuid;
    this.region = props.region ?? this.region;
    this.tokenCallbackUrl = props.tokenCallbackUrl;
    if (props.maxLockRetries !== undefined)
      this.maxLockRetries = props.maxLockRetries;
    if (props.maxLockRetryWaitSeconds !== undefined)
      this.maxLockRetryWaitSeconds = props.maxLockRetryWaitSeconds;
    if (props.doInteractiveSignIn !== undefined)
      this.doInteractiveSignIn = props.doInteractiveSignIn;
  }

  public get isValid(): boolean {
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
