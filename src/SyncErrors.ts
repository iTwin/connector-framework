import * as fs from "fs";
import { Logger } from "@itwin/core-bentley";
import path = require("path");

export interface SyncError {
  system: string;
  phase: string;
  category: string;
  descriptionKey: string;
  description: string;
  kbArticleLink: string;
  canUserFix: boolean;
}

export interface ErrorReport {
  version?: string;
  errors: SyncError[];
}

export interface FatalErrorJSON {
  systems?: Object[];
  categories?: Object[];
  kbArticleLinks?: Object[];
  errors: FatalError[];
}

interface FatalErrorProps {
  description: string;
  categoryId: string;
  kbLinkId: string;
  canUserFix: boolean;
}

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
export class FatalErrors {
  private _localPath: string;
  private _jsonObject: FatalErrorJSON| undefined;
  private _categories?: Object[];
  private _kbArticleLinks?: Object[];
  private _errors?: FatalError[];
  constructor() {
    const directoryPath = this.getDirectoryPath();
    this._localPath = `${directoryPath}\\fatal-errors.json`;
  }
  public getDirectoryPath(): string {
    const currentWorkingDirectory = process.cwd();
    const directoryPath = path.join(currentWorkingDirectory, "assets");
    return directoryPath;
  }

  public read(): void {
    if (this._jsonObject)
      return;

    const directoryPath = this.getDirectoryPath();

    if (!fs.existsSync(directoryPath))
      fs.mkdirSync(directoryPath);

    const data = fs.readFileSync(this._localPath, "utf8");
    this._jsonObject = JSON.parse(data);
  }
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

  public getCategory(categoryId: string): string|undefined {

    if (this._jsonObject === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NOT been read!`);
      return undefined;
    }

    if (this._jsonObject.categories === undefined) {
      Logger.logError("itwin-connector.Framework", `FatalErrors file has NO categories!`);
      return undefined;
    }

    const category: any = this._jsonObject.categories[categoryId as any];

    return category;
  }
}

