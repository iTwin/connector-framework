
/**
 * @module iModelServiceClientProxy
 */

import { generateGuid } from "./Guid";

/**
 * Interface for a client proxy to the iModel service.
 */
export interface IModelServiceClientProxy {
  createChangeSetGroupId(description: string): ChangeSetGroup;
  get connected(): boolean;
  get changeSetGroups(): ChangeSetGroup[];
  connect (): void;

}

/**
 * Class to represent an IModelHub
 */
export class IModelHubProxy implements IModelServiceClientProxy {
  private _changeSetGroups: ChangeSetGroup[] = [];
  private _connected: boolean = false;
  public constructor() {
  }
  public connect(): void {
    this._connected = true;
  }

  public getGroupByDescription(description: string): ChangeSetGroup | undefined {
    return this._changeSetGroups.find((group) => group.description === description);
  }

  public createChangeSetGroupId(description: string): ChangeSetGroup {
    // const guid = "00000000-0000-0000-0000-000000000000";
    const guid = generateGuid();
    this._changeSetGroups.push(new ChangeSetGroup(guid, description));
    return this._changeSetGroups[this._changeSetGroups.length - 1];
  }
  public get connected(): boolean {
    return this._connected;
  }
  public get changeSetGroups(): ChangeSetGroup[] {
    return this._changeSetGroups;
  }
}

/**
 * Class to represent a ChangeSetGroup
 */
export class ChangeSetGroup {
  public constructor(public groupId: string, public description: string) {
    this.groupId = groupId;
    this.description = description;
  }
  public get valid(): boolean {
    return this.groupId.length > 0;
  }
  public get id(): string | PromiseLike<string> {
    return this.groupId;
  }
}
