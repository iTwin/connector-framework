import type { AccessToken} from "@itwin/core-bentley";
import { IModelHost } from "@itwin/core-backend";

export class TestIModelManager {
    private _existingModels : string[];
    private _modelIdCreated?: string;

    constructor (private _iTwinId : string, private _iModelName: string, private _reuseExistingModel = false , private _deleteExistingModels = true) {
    this._existingModels = [];
    }

    async createIModel (accessToken: AccessToken) : Promise<string> {
        let currName : string = this._iModelName;
        let foundIModelId : string|undefined = await IModelHost.hubAccess.queryIModelByName({ iTwinId: this._iTwinId, iModelName: currName});
        let i : number = 0;
        
        if (this._reuseExistingModel && foundIModelId) {
            this._existingModels.push (foundIModelId);
            return foundIModelId;
        }

        while (foundIModelId) {
            this._existingModels.push (foundIModelId);
            ++i;
            currName = this._iModelName + i;
            foundIModelId = await IModelHost.hubAccess.queryIModelByName({ iTwinId: this._iTwinId, iModelName: currName});
        }

        this._modelIdCreated = await IModelHost.hubAccess.createNewIModel({ accessToken: accessToken, iTwinId: this._iTwinId, iModelName: currName });

        if (this._modelIdCreated === undefined)
            throw new Error (`Failed to create a new model named ${currName} in iTwin (project) ${this._iTwinId}`);

        return this._modelIdCreated;
    }

    async deleteIModel (accessToken: AccessToken) {
        if (this._modelIdCreated)
            await IModelHost.hubAccess.deleteIModel({accessToken: accessToken, iTwinId: this._iTwinId, iModelId: this._modelIdCreated});

        if (this._deleteExistingModels) {
            this._existingModels.forEach (async model => {
                await IModelHost.hubAccess.deleteIModel({accessToken: accessToken, iTwinId: this._iTwinId, iModelId: model});
            });
        }

    }
}