/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { LoggerCategories } from "./LoggerCategory";
import {Logger} from "@itwin/core-bentley";

/* eslint-disable @typescript-eslint/naming-convention */

function dumpFetchParams(url: string, method: string, body?: string) {
  Logger.logInfo (LoggerCategories.Framework, `fetching ${url}`);
  Logger.logInfo (LoggerCategories.Framework, `method ${method}`);
  if (body)
    Logger.logInfo (LoggerCategories.Framework, `body ${body}`);
}

/**
 * @module ChangeSetGroup
 * @description This module provides wrapper methods around REST APIs for creating, getting and closing ChangeSetGroups
 *
 */
type fetcherCallback = (json: any) => void;

/**
 * @interface FetcherParams
 * @description Interface for parameters used by Fetcher, the base class for all fetchers
 * @property {string} hostName - The host name e.g. "https://api.bentley.com" (default)
 * @property {string} token - valid Bearer token for scope itwin-platform.
 * @property {string} modelId - The model id
 * @property {fetcherCallback} [callback] - The callback used to process the response
 */
export interface FetcherParams {
  hostName: string;
  token: string;
  modelId: string;
  callback?: fetcherCallback;
}

/**
 * @interface CreateFetcherParams
 * @description Interface for parameters used by CreateFetcher
 * @property {string} description - The description of the changeset group to be created
 * @extends FetcherParams
 */
interface CreateFetcherParams extends FetcherParams {
  description: string;
}

/**
 * @interface GetFetcherParams
 * @description Interface for parameters used by GetFetcher
 * @property {string} changesetGroupId - The changeset group id of the changeset group to be fetched
 * @extends FetcherParams
 */
interface GetFetcherParams extends FetcherParams {
  changesetGroupId: string;
}

/**
 * @interface CloseFetcherParams
 * @description Interface for parameters used by CloseFetcher
 * @property {string} changesetGroupId - The changeset group id of the changeset group to be closed
 * @extends FetcherParams
 */
interface CloseFetcherParams extends FetcherParams {
  changesetGroupId: string;
}

/**
 * @class Fetcher
 * @description Abstract class for Fetcher which sets up the fetch request
 * @property {string} _hostName - The host name
 * @property {string} _token - The auth token
 * @property {fetcherCallback} [_callback] - The callback used to process the response
 * @property {"POST"|"GET"|"PATCH"} _method - The method
 * @property {string} _urlFolderPath - The url folder path
 * @property {string} _modelId - The model id
 * @method {string} url - The url
 * @method {object} headers - The headers
 * @method {Promise<any>} execute - The execute method
 * @abstract
 * @implements FetcherParams
 */
export abstract class Fetcher {
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

  /**
   * @method
   * @name url used to fetch the changeset group data
   * @description The url which should be overridden by derived class
   * @returns {string} The url
   */
  protected get url(): string{
    throw new Error("Method not implemented.");
  }

  /**
   * @method
   * @name headers
   * @description The headers
   * @returns {object} The headers
   * @property {string} Accept - The accept
   * @property {string} Authorization - The authorization
   * @property {string} Content-type - The content type
   * @readonly
   */
  protected get headers() {
    return {
      "Accept": "application/vnd.bentley.itwin-platform.v2+json",
      "Authorization": this._token,
      "Content-type": "application/json",
    };
  }

  /**
   * @method
   * @name execute which performs the fetch request and calls the callback processes the response
   * @description The execute method
   * @returns {Promise<any>} The execute method
   */
  public async execute() {
    let returndata: any;
    const reqInit = {
      method: this._method,
      headers: this.headers,
    };
    dumpFetchParams (this.url, reqInit.method);
    await fetch(this.url, reqInit)
      .then(async (response) => response.json())
      .then((json) => returndata = (this._callback ? this._callback(json): undefined));
    return returndata;
  }
}

/**
 * @class FetcherWithBody
 * @description Abstract class for fetch operations that require a body such as GetFetcher and CloseFetcher
 * @property {any} _body - The body
 * @method {Promise<any>} execute - The execute method
 * @abstract
 * @extends Fetcher
 */
abstract class FetcherWithBody extends Fetcher {
  protected _body: any;
  constructor(params: FetcherParams) {
    super(params);

  }

  /**
   * @method
   * @name execute
   * @description The execute method does everything the base class does and also includes the body
   * @returns {Promise<any>} The execute method
   */
  public override async execute(): Promise<any> {
    let returndata: any;
    const reqInit = {
      method: this._method,
      headers: this.headers,
      body: JSON.stringify(this._body),
    };
    dumpFetchParams (this.url, reqInit.method, reqInit.body);
    await fetch(this.url, reqInit)
      .then(async (response) => response.json())
      .then((json) => returndata = (this._callback ? this._callback(json): undefined));
    return returndata;
  }
}

/**
 * @class CreateFetcher
 * @description Class to create a ChangeSetGroup
 * @extends FetcherWithBody
 * @property {string} _method - The method
 * @property {any} _body - The body
 * @method {string} url - The url
 * @method {object} headers - The headers
 * @method {Promise<any>} execute - The execute method
 * @implements CreateFetcherParams
 */
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

/**
 * @class GetFetcher
 * @description Class to get a ChangeSetGroup
 * @extends Fetcher
 * @property {string} _changesetGroupId - The changeset group id
 * @method {string} url - The url
 * @method {object} headers - The headers
 * @method {Promise<any>} execute - The execute method
 * @implements GetFetcherParams
 */
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

/**
 * @class CloseFetcher
 * @description Class to close a ChangeSetGroup
 * @extends FetcherWithBody
 * @property {string} _changesetGroupId - The changeset group id
 * @method {string} url - The url
 * @method {object} headers - The headers
 * @method {Promise<any>} execute - The execute method
 * @implements CloseFetcherParams
 */
class CloseFetcher extends FetcherWithBody {
  private _changesetGroupId: string;
  constructor(params: CloseFetcherParams) {
    super(params);
    this._method = "PATCH";
    this._body = {state: "completed"};
    this._changesetGroupId = params.changesetGroupId;
  }

  protected override get url(): string {
    return `${this._hostName}/imodels/${this._modelId}/changesetgroups/${this._changesetGroupId}`;
  }
}

/**
 * @interface ChangeSetGroupParams
 * @description Interface for parameters used by ChangeSetGroup
 * @property {string} id - The id
 * @property {string} state - The state
 * @property {string} description - The description
 * @property {string} creatorId - The creator id
 * @property {string} createdDateTime - The created date time
 */
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
  /**
   * @method  hostName
   * @description The host name
   * @static
   * @returns {string} The host name
   */
  public static get hostName() {
    const urlPrefix = process.env.imjs_url_prefix;
    if (urlPrefix)
      return `https://${urlPrefix}api.bentley.com`;
    else
      return "https://api.bentley.com";
  }

  /**
   * @method  create a new ChangeSetGroup in a given model
   * @param {string} token - authorization header with valid bearer token for scope itwin-platform.
   * @param {string} description - The description
   * @param {string} modelId - The model id
   * @returns {Promise<ChangeSetGroup | undefined>} The newlt created ChangeSetGroup
   * @static
   */
  public static async createChangeSetGroup(token: string, description: string, modelId: string): Promise<ChangeSetGroup | undefined> {
    Logger.logInfo (LoggerCategories.Framework, `createChangeSetGroup - fetching a new changeset group for model ${modelId} with description ${description}`);
    const fetcher = new CreateFetcher({token, description, modelId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
  }

  /**
   * @method  getChangeSetGroup - get a ChangeSetGroup of a given id in a given model
   * @param {string} token - authorization header with valid bearer token for scope itwin-platform.
   * @param modelId
   * @param changesetGroupId
   * @returns the changeset group matching the changesetGroupId or undefined if not found
   */
  public static async getChangeSetGroup(token: string, modelId: string, changesetGroupId: string): Promise<ChangeSetGroup | undefined> {
    Logger.logInfo (LoggerCategories.Framework, `getChangeSetGroup - fetching changeset group ${changesetGroupId} for model ${modelId}`);
    const fetcher = new GetFetcher({token, modelId, changesetGroupId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
  }

  /**
   * @method closeChangeSetGroup - close a ChangeSetGroup of a given id in a given model
   * @param {string} token - authorization header with valid bearer token for scope itwin-platform.
   * @param modelId
   * @param changesetGroupId
   * @returns The closed ChangeSetGroup
   */
  public static async closeChangeSetGroup(token: string, modelId: string, changesetGroupId: string): Promise<ChangeSetGroup | undefined> {
    Logger.logInfo (LoggerCategories.Framework, `closeChangeSetGroup - closing changeset group ${changesetGroupId} for model ${modelId}`);
    const fetcher = new CloseFetcher({token, modelId, changesetGroupId, hostName: this.hostName});
    const chgSetGrp: ChangeSetGroup = await fetcher.execute();
    return chgSetGrp;
  }

  /**
 * @method  createArray - factory method to create an array of ChangeSetGroup(s)
 * @param json from response to fetch
 * @returns array of ChangeSetGroup(s) parsed from json
 */
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

  /**
 * @method  create - factory method to create a ChangeSetGroup
 * @param json from response to fetch
 * @returns ChangeSetGroup parsed from json
 */
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
  /**
   * @method  valid
   * @description tests if the group id is valid
   * @returns true if the length of group id string is greater than 0
   */
  public get valid(): boolean {
    return this._groupId.length > 0;
  }
  /**
   * @method  id
   * @description The change set group id
   * @returns {string} The group id
   */
  public get id(): string {
    return this._groupId;
  }

  /**
   * @method  description
   * @description The description of the change set group
   * @returns {string} The description
   */
  public get description(): string {
    return this._description;
  }

  /**
   * @method  state
   * @description The state of the change set group: inProgress or completed
   * @returns {string} The state
   */
  public get state(): string {
    return this._state;
  }

  /**
   * @method  creatorId
   * @description The id of the creator of the change set group
   * @returns {string} The creator id
   * @readonly
   */
  public get creatorId(): string {
    return this._creatorId;
  }

  /**
   * @method  createdDateTime
   * @description The date and time the change set group was created
   * @returns {string} The created date time
   * @readonly
   */
  public get createdDateTime(): string {
    return this._createdDateTime;
  }
}
