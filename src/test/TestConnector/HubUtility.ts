/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {AccessToken, GuidString, Logger } from "@itwin/core-bentley";
import { BriefcaseQuery, HubIModel, IModelQuery } from "@bentley/imodelhub-client";
import { IModelHubBackend} from "./IModelHubBackend";
import { CreateNewIModelProps, IModelHost, IModelHostConfiguration } from "@itwin/core-backend";
export class HubUtility {
  m_config:IModelHostConfiguration;

constructor (){
  this.m_config = new IModelHostConfiguration();
  this.m_config.hubAccess = new IModelHubBackend();

  IModelHost.startup(this.m_config);
}

  public static logCategory = "HubUtility";

  public static async queryIModelByName(requestContext: AccessToken, projectId: string, iModelName: string): Promise<HubIModel | undefined> {
    const iModels = await IModelHubBackend.prototype.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
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
  public static async queryIModelIdByName(requestContext: AccessToken, projectId: string, iModelName: string): Promise<GuidString> {
    const iModel: HubIModel | undefined = await HubUtility.queryIModelByName(requestContext, projectId, iModelName);
    if (!iModel || !iModel.id)
      throw new Error(`IModel ${iModelName} not found`);
    return iModel.id;
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcasesById(accessToken: AccessToken, iModelId: GuidString, onReachThreshold: () => void, acquireThreshold: number = 16): Promise<void> {
    const briefcases = await IModelHubBackend.prototype.iModelClient.briefcases.get(accessToken, iModelId, new BriefcaseQuery().ownedByMe());

      if (briefcases.length > acquireThreshold) {
      onReachThreshold();

      const promises = new Array<Promise<void>>();
      briefcases.forEach((briefcase) => {
        promises.push(IModelHubBackend.prototype.iModelClient.briefcases.delete(accessToken, iModelId, briefcase.briefcaseId!));
      });
      await Promise.all(promises);
    }
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcases(accessToken: AccessToken, projectId: string, iModelName: string, acquireThreshold: number = 16): Promise<void> {
    const iModelId: GuidString = await HubUtility.queryIModelIdByName(accessToken, projectId, iModelName);

    return this.purgeAcquiredBriefcasesById(accessToken, iModelId, () => {
      Logger.logInfo(HubUtility.logCategory, `Reached limit of maximum number of briefcases for ${projectId}:${iModelName}. Purging all briefcases.`);
    }, acquireThreshold);
  }

  /** Create  */
  public static async recreateIModel(accessToken: AccessToken, projectId: GuidString, iModelName: string): Promise<GuidString> {
    // Delete any existing iModel
    try {
      const deleteIModelId: GuidString = await HubUtility.queryIModelIdByName(accessToken, projectId, iModelName);
      await IModelHubBackend.prototype.iModelClient.iModels.delete(accessToken, projectId, deleteIModelId);
    } catch (err) {
      Logger.logError(HubUtility.logCategory, "Failed to recreate an IModel");
    }

    // Create a new iModel
    const iModel: HubIModel = await IModelHubBackend.prototype.iModelClient.iModels.create(accessToken, projectId, iModelName, { description: `Description for ${iModelName}` });
    return iModel.wsgId;
  }
}

