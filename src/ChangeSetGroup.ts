/* eslint-disable @typescript-eslint/naming-convention */
/*
function dumpFetchParams (url:string, reqInit : any) {
  console.log (url);
  console.log (reqInit);
}
*/

type fetcherCallback = (json: any) => void;

interface FetcherParams {
  hostName: string;
  token: string;
  callback: fetcherCallback;
}

interface CreateFetcherParams extends FetcherParams {
  description: string;
  modelId: string;
}

abstract class Fetcher {
  protected _hostName: string;
  protected _token: string;
  protected _callback: fetcherCallback;
  protected _method: "POST"|"GET"|"PATCH";
  protected _urlFolderPath: string;

  constructor(params: FetcherParams) {
    this._hostName = params.hostName;
    this._token = params.token;
    this._callback = params.callback;
    this._urlFolderPath = "";
    this._method = "GET"; // default to get but should be overridden by derived class
  }

  protected get url(): string{
    throw new Error("Method not implemented.");
  }
  protected get headers() {
    return {
      "Accept": "application/vnd.bentley.itwin-platform.v2+json",
      "Authorization": this._token,
      "Content-type": "application/json",
    };
  }
  public async execute() {
    await fetch(this.url,
      {
        method: this._method,
        headers: this.headers,
      });
  }
}

abstract class FetcherWithBody extends Fetcher {
  protected _body: any;
  constructor(params: FetcherParams) {
    super(params);
  }

  public override async execute(): Promise<any> {
    let returndata: any;
    const reqInit = {
      method: this._method,
      headers: this.headers,
      body: JSON.stringify(this._body),
    };
    // dumpFetchParams (this.url, reqInit);
    await fetch(this.url, reqInit)
      .then(async (response) => response.json())
      .then((json) => returndata = this._callback(json));
    return returndata;
  }
}

class CreateFetcher extends FetcherWithBody {
  private _modelId: string;
  constructor(params: CreateFetcherParams) {
    super(params);
    this._method = "POST";
    this._body = {description: params.description};
    this._modelId = params.modelId;
    this._callback = (json) => {
      return ChangeSetGroup.create(json.changesetGroup);
    };
  }

  protected override get url(): string {
    return `${this._hostName}/imodels/${this._modelId}/changesetgroups`;
  }
}

/**
 * Class to represent an IModelHub
 */
export class IModelHubProxy{
  private static _token: string;
  private static _hostName: string = "https://api.bentley.com";
  public static get token() {
    return this._token;
  }
  public static set token(token: string) {
    this._token = token;
  }

  public static set hostName(value: string) {
    if (value === "")
      throw new Error("url cannot be empty");

    this._hostName = value;
  }

  public static get hostName() {
    return this._hostName;
  }

  public static async create(description: string, modelId: string): Promise<ChangeSetGroup | undefined> {
    const fetcher = new CreateFetcher({token: this.token, description, modelId, hostName: this.hostName,
      callback: (json) => {
        return ChangeSetGroup.create(json.changesetGroup);
      }});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
  }

  public static async create2(description: string, modelId: string): Promise<ChangeSetGroup | undefined> {
    let csGrp: ChangeSetGroup | undefined;
    const reqInit = {
      method: "POST",
      headers: {
        "Accept": "application/vnd.bentley.itwin-platform.v2+json",
        "Authorization": this.token,
        "Content-type": "application/json",
      },
      body: JSON.stringify({  description      }),
    };

    const url: string = `https://api.bentley.com/imodels/${modelId}/changesetgroups`;

    // dumpFetchParams (url, reqInit);

    await fetch(url, reqInit)
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
