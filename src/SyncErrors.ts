/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import { Logger } from "@itwin/core-bentley";
import path = require("path");

/**
 * @description: The SyncError interface represents the structure of a single error in the Syncerr.json file
 */
export interface SyncError {
  system: string;
  phase: string;
  category: string;
  descriptionKey: string;
  description: string;
  kbArticleLink: string;
  canUserFix: boolean;
}

/**
 * @description: The ErrorReport interface represents the structure of the Syncerr.json file
*/
export interface ErrorReport {
  version?: string;
  errors: SyncError[];
}

/**
 * @description: The FatalErrorJSON interface represents the structure of the fatal-errors.json file
 */
export interface FatalErrorJSON {
  systems?: Object[];
  categories?: Object[];
  kbArticleLinks?: Object[];
  errors: FatalError[];
}

/**
 * @description: The FatalErrorProps interface represents the properties of a fatal error
 */
interface FatalErrorProps {
  description: string;
  categoryId: string;
  kbLinkId: string;
  canUserFix: boolean;
}

/**
 * @description: The FatalError class represents a fatal error
 */
export class FatalError implements FatalErrorProps {
  constructor(properties: FatalErrorProps) {
    this.description = properties.description;
    this.categoryId = properties.categoryId;
    this.kbLinkId = properties.kbLinkId;
    this.canUserFix = properties.canUserFix;
  }
  public description: string;
  public categoryId: string;
  public kbLinkId: string;
  public canUserFix: boolean;

}

/**
 * @description: The FatalErrors class reads the fatal-errors.json file and provides methods to access the fatal errors
 */
export class FatalErrors {
  private _localPath: string;
  private _jsonObject: FatalErrorJSON| undefined;
  private _categories?: Object[];
  private _kbArticleLinks?: Object[];
  private _errors?: FatalError[];
  /**
   * @description: Constructor for the FatalErrors class
   */
  constructor() {
    const directoryPath = this.getDirectoryPath();
    this._localPath = `${directoryPath}\\fatal-errors.json`;
  }

  /**
   * @description: The directory path to the assets folder
   * @returns a string containing the path to the assets folder
   */
  public getDirectoryPath(): string {
    const currentWorkingDirectory = process.cwd();
    const directoryPath = path.join(currentWorkingDirectory, "assets");
    return directoryPath;
  }

  /**
   * @description: Reads the fatal-errors.json file and populates the jsonObject property
   */
  public read(): void {
    if (this._jsonObject)
      return;

    const directoryPath = this.getDirectoryPath();

    if (!fs.existsSync(directoryPath))
      fs.mkdirSync(directoryPath);

    const data = fs.readFileSync(this._localPath, "utf8");
    this._jsonObject = JSON.parse(data);
  }

  /**
   * @description: Returns a sync error object populated with the fatal error matching the given errorKey
   * @param errorKey index into the errors array
   * @returns a sync error object populated with the fatal error matching the given errorKey or undefined if the errorKey does not exist
   */
  public getError(errorKey: string): SyncError|undefined {

    if (this._jsonObject === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NOT been read!`);
      return undefined;
    }

    const foundError: FatalError = this._jsonObject.errors[errorKey as any];

    const syncErr: SyncError = {
      system: "Unknown",
      phase: "Unknown",
      category: this.getCategory(foundError.categoryId) ?? "Unknown",
      descriptionKey: errorKey,
      description: foundError.description,
      kbArticleLink: this.getkbArticleLink(foundError.kbLinkId) ?? "Unknown",
      canUserFix: foundError.canUserFix,
    };

    return syncErr;
  }

  /**
   * @description: Returns the url from an array of kbArticleLinks
   * @param kbLinkId - a string containing a key to the kbArticleLinks array
   * @returns a string containing the link(url) to the kb article if key exists in the kbArticleLinks array, otherwise undefined
   */
  public getkbArticleLink(kbLinkId: string): string|undefined {

    if (this._jsonObject === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NOT been read!`);
      return undefined;
    }

    if (this._jsonObject.kbArticleLinks === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NO kbArticleLinks!`);
      return undefined;
    }

    const kbArticleLink: any = this._jsonObject.kbArticleLinks[kbLinkId as any];

    return kbArticleLink;
  }

  /**
   * @description: The category id to be checked
   * @param categoryId
   * @returns boolean indicating if the category exists or not
   */
  public categoryExists(categoryId: string): boolean {
    if (this._jsonObject === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NOT been read!`);
      return false;
    }

    if (this._jsonObject.categories === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NO categories!`);
      return false;
    }

    return this._jsonObject.categories.indexOf(categoryId) >= 0;
  }

  /**
   * @description: The category id to be checked
   * @param categoryId
   * @returns the validated category id if it exists or "other" (if 'other' exists) , otherwise undefined
   */
  public getCategory(categoryId: string): string|undefined {
    if (this.categoryExists (categoryId))
      return categoryId;
    else if (this.categoryExists ("other"))
      return "other";
    else
      return undefined;
  }

}
