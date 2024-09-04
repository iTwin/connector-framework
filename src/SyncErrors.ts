/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SyncErrors } from "./iModelConnectorErrors";
import SEErrors = SyncErrors.Errors;
import SEError = SyncErrors.Error;


export interface SystemPhase {
  system?: string;
  phase?: string;
}

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
 * @description: looks up the structured error by key and populates the SyncError object
 * @param errorKey - the key of the error to look up
 * @param phase - the phase of the connector where the error occurred
 * @returns a structured error object, SyncError
 */
export function getSyncError(errorKey: string, system?: string, phase?: string): SyncError|undefined {
  const foundError: SEError = SEErrors[errorKey as keyof SEErrors];

  const syncErr: SyncError = {
    system: system ?? "Unknown",
    phase: phase ?? "Unknown",
    category: foundError.category,
    descriptionKey: errorKey,
    description: foundError.description,
    kbArticleLink: foundError.kbArticleLink,
    canUserFix: foundError.canUserFix,
  };

  return syncErr;
}
