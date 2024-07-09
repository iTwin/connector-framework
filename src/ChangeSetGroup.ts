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
  modelId: string;
  callback?: fetcherCallback;
}

interface CreateFetcherParams extends FetcherParams {
  description: string;
}

interface GetFetcherParams extends FetcherParams {
  changesetGroupId: string;
}

interface CloseFetcherParams extends FetcherParams {
  state: CloseState;
  changesetGroupId: string;
}

abstract class Fetcher {
  protected _hostName: string;
  protected _token: string;
  protected _callback?: fetcherCallback;
  protected _method: "POST"|"GET"|"PATCH";
  protected _urlFolderPath: string;
  protected _modelId: string;

  constructor(params: FetcherParams) {
    this._hostName = params.hostName;
    this._token = params.token;
    this._urlFolderPath = "";
    this._method = "GET"; // default to get but should be overridden by derived class
    this._modelId = params.modelId;
    this._callback = (json) => {
      return ChangeSetGroup.create(json.changesetGroup);
    };
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
    let returndata: any;
    const reqInit = {
      method: this._method,
      headers: this.headers,
    };
    await fetch(this.url, reqInit)
      .then(async (response) => response.json())
      .then((json) => returndata = (this._callback ? this._callback(json): undefined));
    return returndata;
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
      .then((json) => returndata = (this._callback ? this._callback(json): undefined));
    return returndata;
  }
}

class CreateFetcher extends FetcherWithBody {
  constructor(params: CreateFetcherParams) {
    super(params);
    this._method = "POST";
    this._body = {description: params.description};
  }

  protected override get url(): string {
    return `${this._hostName}/imodels/${this._modelId}/changesetgroups`;
  }
}

class GetFetcher extends Fetcher {
  private _changesetGroupId: string;
  constructor(params: GetFetcherParams) {
    super(params);
    this._changesetGroupId = params.changesetGroupId;
  }

  protected override get url(): string {
    return `${this._hostName}/imodels/${this._modelId}/changesetgroups/${this._changesetGroupId}`;
  }
}

class GetAllFetcher extends Fetcher {
  constructor(params: FetcherParams) {
    super(params);
    this._callback = (json) => {
      return ChangeSetGroup.createArray(json);
    };
  }

  protected override get url(): string {
    return `${this._hostName}/imodels/${this._modelId}/changesetgroups`;
  }
}

class CloseFetcher extends FetcherWithBody {
  private _changesetGroupId: string;
  constructor(params: CloseFetcherParams) {
    super(params);
    this._method = "PATCH";
    this._body = {state: params.state};
    this._changesetGroupId = params.changesetGroupId;
  }

  protected override get url(): string {
    return `${this._hostName}/imodels/${this._modelId}/changesetgroups/${this._changesetGroupId}`;
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
    const fetcher = new CreateFetcher({token: this.token, description, modelId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
  }

  public static async get(modelId: string, changesetGroupId: string): Promise<ChangeSetGroup | undefined> {
    const fetcher = new GetFetcher({token: this.token, modelId, changesetGroupId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
  }

  public static async getAll(modelId: string): Promise<ChangeSetGroup[] | undefined> {
    const fetcher = new GetAllFetcher({token: this.token, modelId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup[] = await fetcher.execute();
    return chgSetGrp;
  }

  public static async close(modelId: string, changesetGroupId: string, state: CloseState = "completed"): Promise<ChangeSetGroup | undefined> {
    const fetcher = new CloseFetcher({token: this.token, state, modelId, changesetGroupId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
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
  public get id(): string {
    return this._groupId;
  }
  public get description(): string {
    return this._description;
  }
  public get state(): string {
    return this._state;
  }
  public get creatorId(): string {
    return this._creatorId;
  }
  public get createdDateTime(): string {
    return this._createdDateTime;
  }
}
