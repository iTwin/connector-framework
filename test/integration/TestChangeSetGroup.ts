import { ChangeSetGroup, Fetcher, FetcherParams } from "../../src/ChangeSetGroup";

/**
 * @class GetAllFetcher
 * @description Class to get all ChangeSetGroups
 * @extends Fetcher
 * @method {string} url - The url
 * @method {object} headers - The headers
 * @method {Promise<any>} execute - The execute method
 * @implements FetcherParams
 */
export class GetAllFetcher extends Fetcher {
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

export class TestChangeSetGroup extends ChangeSetGroup {
  public static group: string = "TestChangeSetGroup";

  /**
   * @method  getChangeSetGroups - Get all ChangeSetGroups in a given model
   * @param {string} token - authorization header with valid bearer token for scope itwin-platform.
   * @param modelId
   * @returns an array of ChangeSetGroup(s) or undefined if none found
   */
  // moved this method from ChangeSetGroup to this special subclass, TestChangeSetGroup because it is only used in the test AND
  // it is not ready for production b/c it is unbounded and has no support for filtering nor pagination.
  public static async getChangeSetGroups(token: string, modelId: string): Promise<ChangeSetGroup[] | undefined> {
    // Logger.logInfo (LoggerCategories.Framework, `getChangeSetGroups - fetching all changeset groups for model ${modelId }`);
    const fetcher = new GetAllFetcher({token, modelId, hostName: this.hostName});
    const chgSetGrpArr: ChangeSetGroup[] = await fetcher.execute();
    return chgSetGrpArr;
  }
}
