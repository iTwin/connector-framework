/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { join } from "path";
import type { GuidString} from "@itwin/core-bentley";
import { IModelHubStatus } from "@itwin/core-bentley";
import { Guid } from "@itwin/core-bentley";
import type {
  ChangesetFileProps, ChangesetIndex, ChangesetIndexAndId, ChangesetProps, ChangesetRange, IModelVersion, LocalDirName} from "@itwin/core-common";
import { IModelError,
} from "@itwin/core-common";
import { LocalHub2 } from "./LocalHub2";
import type {
  AcquireNewBriefcaseIdArg, BackendHubAccess, BriefcaseDbArg, BriefcaseIdArg, ChangesetArg,
  ChangesetRangeArg, CheckpointArg, CheckpointProps, CreateNewIModelProps, IModelIdArg,
  IModelNameArg, LockMap, LockProps, TokenArg, V2CheckpointAccessProps,
} from "@itwin/core-backend";
import { IModelHost, IModelJsFs } from "@itwin/core-backend";

export interface OpenIModelProps extends IModelNameArg {
  iModelId: GuidString;
  description?: string;
}

/* This fork of HubMock mocks iModelHub using files on the local file system. It differs from HubMock only in that it
does not generate a new set of files and GUIDs each time it runs. Instead it takes the GUIDs that it should use as arguments,
and it opens and uses an existing hubmock directory. That allows a connector test to pull and push to a hubmock over
the course of repeated runs. */
export class HubMock2 {
  protected static mockRoot: LocalDirName | undefined;
  protected static hubs = new Map<string, LocalHub2>();
  protected static _saveHubAccess: BackendHubAccess;
  protected static _iTwinId: GuidString | undefined;

  public static lockAttemptCount = 0;
  public static acquireLocksShouldFail = 0;

  /** Determine whether a test us currently being run under HubMock */
  public static get isValid() { return undefined !== this.mockRoot; }

  public static get iTwinId() {
    if (undefined === this._iTwinId)
      throw new Error("Either a previous test did not call this.shutdown() properly, or more than one test is simultaneously attempting to use HubMock, which is not allowed");
    return this._iTwinId;
  }

  public static startup(mockName: LocalDirName, outputDir: string): void {
    if (this.isValid)
      throw new Error("Either a previous test did not call HubMock2.shutdown() properly, or more than one test is simultaneously attempting to use HubMock2, which is not allowed");
    this.hubs.clear();
    this.mockRoot = join(outputDir, "HubMock2", mockName);
    if (!IModelJsFs.existsSync(this.mockRoot))
      IModelJsFs.recursiveMkDirSync(this.mockRoot);
    this._saveHubAccess = IModelHost.hubAccess;
    IModelHost.setHubAccess(this);
  }

  public static setITwinId(iTwinId: GuidString): void {
    this._iTwinId = iTwinId;
  }

  public static createOrOpenIModel(arg: OpenIModelProps): void {
    if (!this.mockRoot)
      throw new Error("call startup first");

    const iModelName = arg.iModelName;
    const description = arg.description;
    const mock = new LocalHub2(join(this.mockRoot, arg.iModelId), { ...arg, iModelName, description, openExisting: true });
    this.hubs.set(arg.iModelId, mock);
  }

  /** Stop a HubMock2 that was previously started with [[startup]]
   * @note this function throws an exception if any of the iModels used during the tests are left open.
   */
  public static shutdown() {
    if (!this.isValid)
      return;

    this._iTwinId = undefined;
    for (const hub of this.hubs)
      hub[1].cleanup();

    this.hubs.clear();
    IModelHost.setHubAccess(this._saveHubAccess);
    this.mockRoot = undefined;
  }

  public static findLocalHub(iModelId: GuidString): LocalHub2 {
    const hub = this.hubs.get(iModelId);
    if (!hub)
      throw new Error(`local hub for iModel ${iModelId} not created`);
    return hub;
  }

  /** create a [[LocalHub2]] for an iModel.  */
  public static async createNewIModel(arg: CreateNewIModelProps): Promise<GuidString> {
    if (!this.mockRoot)
      throw new Error("call startup first");

    const props = { ...arg, iModelId: Guid.createValue() };
    const mock = new LocalHub2(join(this.mockRoot, props.iModelId), props);
    this.hubs.set(props.iModelId, mock);
    return props.iModelId;
  }

  /** remove the [[LocalHub2]] for an iModel */
  public static destroy(iModelId: GuidString) {
    this.findLocalHub(iModelId).cleanup();
    this.hubs.delete(iModelId);
  }

  /** All methods below are mocks of the [[BackendHubAccess]] interface */

  public static async getChangesetFromNamedVersion(arg: IModelIdArg & { versionName: string }): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iModelId).findNamedVersion(arg.versionName);
  }

  private static changesetIndexFromArg(arg: ChangesetArg) {
    return (undefined !== arg.changeset.index) ? arg.changeset.index : this.findLocalHub(arg.iModelId).getChangesetIndex(arg.changeset.id);
  }

  public static async getChangesetFromVersion(arg: IModelIdArg & { version: IModelVersion }): Promise<ChangesetProps> {
    const hub = this.findLocalHub(arg.iModelId);
    const version = arg.version;
    if (version.isFirst)
      return hub.getChangesetByIndex(0);

    const asOf = version.getAsOfChangeSet();
    if (asOf)
      return hub.getChangesetById(asOf);

    const versionName = version.getName();
    if (versionName)
      return hub.findNamedVersion(versionName);

    return hub.getLatestChangeset();
  }

  public static async getLatestChangeset(arg: IModelIdArg): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iModelId).getLatestChangeset();
  }

  private static async getAccessToken(arg: TokenArg) {
    return arg.accessToken ?? await IModelHost.getAccessToken();
  }

  public static async getMyBriefcaseIds(arg: IModelIdArg): Promise<number[]> {
    const accessToken = await this.getAccessToken(arg);
    return this.findLocalHub(arg.iModelId).getBriefcaseIds(accessToken);
  }

  public static async acquireNewBriefcaseId(arg: AcquireNewBriefcaseIdArg): Promise<number> {
    const accessToken = await this.getAccessToken(arg);
    return this.findLocalHub(arg.iModelId).acquireNewBriefcaseId(accessToken, arg.briefcaseAlias);
  }

  /** Release a briefcaseId. After this call it is illegal to generate changesets for the released briefcaseId. */
  public static async releaseBriefcase(arg: BriefcaseIdArg): Promise<void> {
    return this.findLocalHub(arg.iModelId).releaseBriefcaseId(arg.briefcaseId);
  }

  public static async downloadChangeset(arg: ChangesetArg & { targetDir: LocalDirName }): Promise<ChangesetFileProps> {
    return this.findLocalHub(arg.iModelId).downloadChangeset({ index: this.changesetIndexFromArg(arg), targetDir: arg.targetDir });
  }

  public static async downloadChangesets(arg: ChangesetRangeArg & { targetDir: LocalDirName }): Promise<ChangesetFileProps[]> {
    return this.findLocalHub(arg.iModelId).downloadChangesets({ range: arg.range, targetDir: arg.targetDir });
  }

  public static async queryChangeset(arg: ChangesetArg): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iModelId).getChangesetByIndex(this.changesetIndexFromArg(arg));
  }

  public static async queryChangesets(arg: IModelIdArg & { range?: ChangesetRange }): Promise<ChangesetProps[]> {
    return this.findLocalHub(arg.iModelId).queryChangesets(arg.range);
  }

  public static async pushChangeset(arg: IModelIdArg & { changesetProps: ChangesetFileProps }): Promise<ChangesetIndex> {
    return this.findLocalHub(arg.iModelId).addChangeset(arg.changesetProps);
  }

  public static async queryV2Checkpoint(_arg: CheckpointProps): Promise<V2CheckpointAccessProps | undefined> {
    return undefined;
  }

  public static async downloadV2Checkpoint(arg: CheckpointArg): Promise<ChangesetIndexAndId> {
    return this.findLocalHub(arg.checkpoint.iModelId).downloadCheckpoint({ changeset: arg.checkpoint.changeset, targetFile: arg.localFile });
  }

  public static async downloadV1Checkpoint(arg: CheckpointArg): Promise<ChangesetIndexAndId> {
    return this.findLocalHub(arg.checkpoint.iModelId).downloadCheckpoint({ changeset: arg.checkpoint.changeset, targetFile: arg.localFile });
  }

  public static async releaseAllLocks(arg: BriefcaseDbArg) {
    const hub = this.findLocalHub(arg.iModelId);
    hub.releaseAllLocks({ briefcaseId: arg.briefcaseId, changesetIndex: hub.getIndexFromChangeset(arg.changeset) });
  }

  public static async queryAllLocks(_arg: BriefcaseDbArg): Promise<LockProps[]> {
    return [];
  }

  public static async acquireLocks(arg: BriefcaseDbArg, locks: LockMap): Promise<void> {
    if (this.acquireLocksShouldFail !== 0) {
      if (this.lockAttemptCount++ < this.acquireLocksShouldFail)
        throw new IModelError(IModelHubStatus.LockOwnedByAnotherBriefcase, "");
      this.lockAttemptCount = 0;
    }
    this.findLocalHub(arg.iModelId).acquireLocks(locks, arg);
  }

  public static async queryIModelByName(arg: IModelNameArg): Promise<GuidString | undefined> {
    for (const hub of this.hubs) {
      const localHub = hub[1];
      if (localHub.iTwinId === arg.iTwinId && localHub.iModelName === arg.iModelName)
        return localHub.iModelId;
    }
    return undefined;
  }

  public static async deleteIModel(arg: IModelIdArg & { iTwinId: GuidString }): Promise<void> {
    return this.destroy(arg.iModelId);
  }
}
