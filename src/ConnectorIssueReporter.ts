/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Abstract implementation of the Issue Reporter
 * @beta
 */
export interface ConnectorIssueReporter {
  /** Records element that have not been visited during the running of the connector */
  recordIgnoredElements: (repositoryLinkId: string, ignoredElementIdList: string) => void;

  /** Reports a generic issue encountered by the connector. The sourceId here will determine what file the issue corresponds to */
  reportIssue: (ecInstanceId: string, sourceId: string, level: "Error" | "Warning", category: string, message: string, type: string) => void;

  /** Records file information for a connector job. Should be called by the connector*/
  recordSourceFileInfo: (sourceId: string, name: string, uniqueName: string, itemType: string, dataSource: string, state: string, failureReason: string, exists: boolean, fileSize: number, foundByConnector: boolean, downloadUrl?: string) => void;

  /** Records additional files for a connector job */
  recordReferenceFileInfo: (sourceId: string, name: string, uniqueName: string, itemType: string, dataSource: string, downloadUrl: string, state: string, failureReason: string, exists: boolean, fileSize: number, foundByConnector: boolean) => void;

  /** Returns the path to the report file */
  getReportPath: () => string;

  /** Creates a JSON report file to be uploaded by the orchestrator */
  publishReport: () => Promise<void>;

  /** Close the issue reporter and any database connections */
  close: () => Promise<void>;
}
