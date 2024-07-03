/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Class to represent an IModelHub
 */
export class IModelHubProxy{
  private static _token: string;
  public static get token() {
    return this._token;
  }

  public static set token(token: string) {
    this._token = token;
  }
  public static async create(description: string, modelId: string): Promise<ChangeSetGroup | undefined> {
    let csGrp: ChangeSetGroup | undefined;
    await fetch(`https://api.bentley.com/imodels/${modelId}/changesetgroups`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.bentley.itwin-platform.v2+json",
          "Authorization": this.token,
          "Content-type": "application/json",
        },
        body: JSON.stringify({  description      }),
      })
      .then(async (response) => response.json())
      .then((json) => {csGrp = ChangeSetGroup.create(json.changesetGroup) ;});

    return csGrp;
  }

  public static async get(modelId: string, changesetGroupId: string): Promise<ChangeSetGroup | undefined>{
    let csGrp: ChangeSetGroup | undefined;
    await fetch(`https://api.bentley.com/imodels/${modelId}/changesetgroups/${changesetGroupId}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/vnd.bentley.itwin-platform.v2+json",
          "Authorization": this.token,
          "Content-type": "application/json",
        },
      })
      .then(async (response) => response.json())
      .then((json) => {csGrp = ChangeSetGroup.create(json.changesetGroup) ;});

    return csGrp;
  }

  public static async getAll(modelId: string): Promise<ChangeSetGroup[]|undefined> {
    let csGrpArr: ChangeSetGroup[]|undefined;
    await fetch(`https://api.bentley.com/imodels/${modelId}/changesetgroups`,
      {
        method: "GET",
        headers: {
          "Accept": "application/vnd.bentley.itwin-platform.v2+json",
          "Authorization": this.token,
          "Content-type": "application/json",
        },
      })
      .then(async (response) => response.json())
      .then((json) => {csGrpArr = ChangeSetGroup.createArray(json);});

    return csGrpArr;
  }

  public static async close(modelId: string, changesetGroupId: string, state: CloseState = "completed") {
    let csGrp: ChangeSetGroup | undefined;
    await fetch(`https://api.bentley.com/imodels/${modelId}/changesetgroups/${changesetGroupId}`,
      {
        method: "PATCH",
        headers: {
          "Accept": "application/vnd.bentley.itwin-platform.v2+json",
          "Authorization": this.token,
          "Content-type": "application/json",
        },
        body: JSON.stringify({state}),
      })
      .then(async (response) => response.json())
      .then((json) => {csGrp = ChangeSetGroup.create(json.changesetGroup) ;});

    return csGrp;
  }

  private _connected: boolean = false;

  public connect(): void {
    this._connected = true;
  }

  public get connected(): boolean {
    return this._connected;
  }

}

type CloseState = "completed" | "timedOut" | "forciblyClosed";

interface ChangeSetGroupParams{
  id: string;
  state: string;
  description: string;
  creatorId: string;
  createdDateTime: string;
}

/**
 * Class to represent a ChangeSetGroup
 */
export class ChangeSetGroup {
  private _groupId: string;
  private _description: string;
  private _state: string;
  private _creatorId: string;
  private _createdDateTime: string;

  public static createArray(json: any): ChangeSetGroup[] | undefined {
    const csGrpArr: ChangeSetGroup[] = [];
    if (json && json.changesetGroups) {
      json.changesetGroups.forEach((csGrp: any) => {
        csGrpArr.push(ChangeSetGroup.create (csGrp));
      });
      return csGrpArr;
    }
    return undefined;
  }
  public static create(json: any): ChangeSetGroup {
    const params: ChangeSetGroupParams = {id : json.id, state :json.state, description: json.description, creatorId : json.creatorId, createdDateTime : json.createdDateTime};
    return new ChangeSetGroup (params);
  }
  public constructor(params: ChangeSetGroupParams) {
    this._groupId = params.id;
    this._description = params.description;
    this._state=params.state;
    this._creatorId = params.creatorId;
    this._createdDateTime = params.createdDateTime;
  }
  public get valid(): boolean {
    return this._groupId.length > 0;
  }
  public get id(): string | PromiseLike<string> {
    return this._groupId;
  }
}
