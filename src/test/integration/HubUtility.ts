/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { GuidString, Logger } from "@bentley/bentleyjs-core";
import { BriefcaseQuery, HubIModel, IModelQuery } from "@bentley/imodelhub-client";
import { AuthorizedBackendRequestContext, IModelHost } from "@bentley/imodeljs-backend";

export class HubUtility {
  public static logCategory = "HubUtility";

  public static async queryIModelByName(requestContext: AuthorizedBackendRequestContext, projectId: string, iModelName: string): Promise<HubIModel | undefined> {
    const iModels = await IModelHost.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
    if (iModels.length === 0)
      return undefined;
    if (iModels.length > 1)
      throw new Error(`Too many iModels with name ${iModelName} found`);
    return iModels[0];
  }

  /**
   * Queries the iModel id by its name
   * @param requestContext The client request context
   * @param projectId Id of the project
   * @param iModelName Name of the iModel
   * @throws If the iModel is not found, or if there is more than one iModel with the supplied name
   */
  public static async queryIModelIdByName(requestContext: AuthorizedBackendRequestContext, projectId: string, iModelName: string): Promise<GuidString> {
    const iModel: HubIModel | undefined = await HubUtility.queryIModelByName(requestContext, projectId, iModelName);
    if (!iModel || !iModel.id)
      throw new Error(`IModel ${iModelName} not found`);
    return iModel.id;
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcasesById(requestContext: AuthorizedBackendRequestContext, iModelId: GuidString, onReachThreshold: () => void, acquireThreshold: number = 16): Promise<void> {
    const briefcases = await IModelHost.iModelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().ownedByMe());
    if (briefcases.length > acquireThreshold) {
      onReachThreshold();

      const promises = new Array<Promise<void>>();
      briefcases.forEach((briefcase) => {
        promises.push(IModelHost.iModelClient.briefcases.delete(requestContext, iModelId, briefcase.briefcaseId!));
      });
      await Promise.all(promises);
    }
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcases(requestContext: AuthorizedBackendRequestContext, projectId: string, iModelName: string, acquireThreshold: number = 16): Promise<void> {
    const iModelId: GuidString = await HubUtility.queryIModelIdByName(requestContext, projectId, iModelName);

    return this.purgeAcquiredBriefcasesById(requestContext, iModelId, () => {
      Logger.logInfo(HubUtility.logCategory, `Reached limit of maximum number of briefcases for ${projectId}:${iModelName}. Purging all briefcases.`);
    }, acquireThreshold);
  }

  /** Create  */
  public static async recreateIModel(requestContext: AuthorizedBackendRequestContext, projectId: GuidString, iModelName: string): Promise<GuidString> {
    // Delete any existing iModel
    try {
      const deleteIModelId: GuidString = await HubUtility.queryIModelIdByName(requestContext, projectId, iModelName);
      await IModelHost.iModelClient.iModels.delete(requestContext, projectId, deleteIModelId);
    } catch (err) {
      console.log(err);
    }

    // Create a new iModel
    const iModel: HubIModel = await IModelHost.iModelClient.iModels.create(requestContext, projectId, iModelName, { description: `Description for ${iModelName}` });
    return iModel.wsgId;
  }
}

