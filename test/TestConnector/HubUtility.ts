/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AccessToken, GuidString} from "@itwin/core-bentley";
import { Logger } from "@itwin/core-bentley";
import { IModelHost, IModelHostConfiguration } from "@itwin/core-backend";
import type { Authorization, AuthorizationCallback } from "@itwin/imodels-client-authoring";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import type {IModel} from "@itwin/imodels-client-management";
export class HubUtility {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private m_config: IModelHostConfiguration;
  private static iModelClient: IModelsClient = new IModelsClient({ api: { baseUrl: `https://${process.env.IMJS_URL_PREFIX ?? ""}api.bentley.com/imodels`}});

  constructor(){
    this.m_config = new IModelHostConfiguration();
    const iModelClient = new IModelsClient({ api: { baseUrl: `https://${process.env.IMJS_URL_PREFIX ?? ""}api.bentley.com/imodels`}});
    this.m_config.hubAccess = new BackendIModelsAccess(iModelClient);

    void IModelHost.startup(this.m_config);
  }

  public static logCategory = "HubUtility";

  public static async queryIModelByName(requestContext: AccessToken, iTwinId: string, iModelName: string): Promise<IModel | undefined> {
    const authCallback: AuthorizationCallback = async () => new Promise<Authorization>(() => {return {scheme: "Bearer", token: requestContext};});
    const iModels = this.iModelClient.iModels.getRepresentationList({ urlParams: { iTwinId, name: iModelName }, authorization: authCallback });
    const imodel = await iModels.next();
    return imodel.value;
  }

  /**
   * Queries the iModel id by its name
   * @param requestContext The client request context
   * @param projectId Id of the project
   * @param iModelName Name of the iModel
   * @throws If the iModel is not found, or if there is more than one iModel with the supplied name
   */
  public static async queryIModelIdByName(requestContext: AccessToken, projectId: string, iModelName: string): Promise<GuidString> {
    const iModel: IModel | undefined = await HubUtility.queryIModelByName(requestContext, projectId, iModelName);
    if (!iModel || !iModel.id)
      throw new Error(`IModel ${iModelName} not found`);
    return iModel.id;
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcasesById(accessToken: AccessToken, iModelId: GuidString): Promise<void> {
    const authCallback: AuthorizationCallback = async () => new Promise<Authorization>(() => {return {scheme: "Bearer", token: accessToken};});
    const briefcases = this.iModelClient.briefcases.getRepresentationList({ iModelId, urlParams: { ownerId: "me" }, authorization: authCallback });

    // if (briefcases.length > acquireThreshold) {
    // onReachThreshold();

    const promises = new Array<Promise<void>>();
    for await(const b of briefcases) {
      promises.push(this.iModelClient.briefcases.release({iModelId, briefcaseId: b.briefcaseId, authorization: authCallback}));
    }
    // briefcases.forEach((briefcase) => {
    //   promises.push(this.iModelClient.briefcases.release({iModelId: iModelId, briefcaseId: briefcase.briefcaseId, authorization: authCallback}));
    // });
    await Promise.all(promises);

  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcases(accessToken: AccessToken, projectId: string, iModelName: string): Promise<void> {
    const iModelId: GuidString = await HubUtility.queryIModelIdByName(accessToken, projectId, iModelName);

    return this.purgeAcquiredBriefcasesById(accessToken, iModelId);
  }

  /** Create  */
  public static async recreateIModel(accessToken: AccessToken, iTwinId: GuidString, iModelName: string): Promise<GuidString> {
    // Delete any existing iModel
    const authCallback: AuthorizationCallback = async () => new Promise<Authorization>(() => {return {scheme: "Bearer", token: accessToken};});
    try {
      const deleteIModelId: GuidString = await HubUtility.queryIModelIdByName(accessToken, iTwinId, iModelName);
      await this.iModelClient.iModels.delete({iModelId: deleteIModelId, authorization: authCallback});
    } catch (err) {
      Logger.logError(HubUtility.logCategory, "Failed to recreate an IModel");
    }

    // Create a new iModel
    const iModel: IModel = await this.iModelClient.iModels.createEmpty({iModelProperties: {iTwinId, name: iModelName, description: `Description for ${iModelName}`}, authorization: authCallback});
    return iModel.id;
  }
}

