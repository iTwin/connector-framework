
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AccessToken, BentleyStatus, Id64String} from "@itwin/core-bentley";
import { assert, IModelStatus } from "@itwin/core-bentley";
import type { RelationshipProps} from "@itwin/core-backend";
import { DefinitionModel, DefinitionPartition, GroupInformationPartition, IModelDb, IModelJsFs, PhysicalModel, PhysicalPartition, SubjectOwnsPartitionElements } from "@itwin/core-backend";
import type { InformationPartitionElementProps} from "@itwin/core-common";
import { IModel, IModelError } from "@itwin/core-common";

import type { SourceItem, SynchronizationResults } from "../../Synchronizer";
import { ItemState } from "../../Synchronizer";
import { TestConnectorSchema } from "./TestConnectorSchema";
import { TestConnectorGroupModel } from "./TestConnectorModels";

import * as fs from "fs";
import { ModelNames } from "./TestConnector";
import { BaseConnector } from "../../BaseConnector";

export default class TestConnector extends BaseConnector {
  public static override async create(): Promise<TestConnector> {
    return new TestConnector();
  }
  public async importDefinitions(): Promise<any> {
    return;
  }
  public async importDynamicSchema(requestContext?: AccessToken): Promise<any> {
    assert(requestContext !== undefined);
    return;
  }
  public async  updateExistingData(): Promise<any> {
    return;
  }
  public getApplicationId(): string {
    return "2661";
  }
  public getApplicationVersion(): string {
    return "1.0.0.0";
  }
  public getConnectorName(): string {
    return "FailTestITwinConnector";
  }
  private _data: any;
  private _sourceDataState: ItemState = ItemState.New;
  private _sourceData?: string;
  private _repositoryLinkId?: Id64String;
  public initialize(_params: any) {
    // nothing to do here
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private get repositoryLinkId(): Id64String {
    assert(this._repositoryLinkId !== undefined);
    return this._repositoryLinkId;
  }
  public async initializeJob(): Promise<void> {
    if (ItemState.New === this._sourceDataState) {
      this.createGroupModel();
      this.createPhysicalModel();
      this.createDefinitionModel();
    }
  }
  public async openSourceData(sourcePath: string): Promise<void> {
    // ignore the passed in source and open the test file
    const json = fs.readFileSync(sourcePath, "utf8");
    this._data = JSON.parse(json);
    this._sourceData = sourcePath;

    const documentStatus = this.getDocumentStatus(); // make sure the repository link is created now, while we are in the repository channel
    this._sourceDataState = documentStatus.itemState;
    this._repositoryLinkId = documentStatus.elementProps.id;
  }
  public override async onOpenIModel(): Promise<BentleyStatus> {
    throw new IModelError(IModelStatus.BadArg, "Expected Fail for test");
  }
  public async importDomainSchema(_requestContext: AccessToken): Promise<any> {
    if (this._sourceDataState === ItemState.Unchanged) {
      return;
    }
    TestConnectorSchema.registerSchema();
    const fileName = TestConnectorSchema.schemaFilePath;
    await this.synchronizer.imodel.importSchemas([fileName]);
  }
  private getDocumentStatus(): SynchronizationResults {
    let timeStamp = Date.now();
    assert(this._sourceData !== undefined, "we should not be in this method if the source file has not yet been opened");
    const stat = IModelJsFs.lstatSync(this._sourceData); // will throw if this._sourceData names a file that does not exist. That would be a bug. Let it abort the job.
    if (undefined !== stat) {
      timeStamp = stat.mtimeMs;
    }

    const sourceItem: SourceItem = {
      id: this._sourceData,
      version: timeStamp.toString(),
    };
    const documentStatus = this.synchronizer.recordDocument(IModelDb.rootSubjectId, sourceItem);
    if (undefined === documentStatus) {
      const error = `Failed to retrieve a RepositoryLink for ${this._sourceData}`;
      throw new IModelError(IModelStatus.BadArg, error);
    }
    return documentStatus;
  }
  private createGroupModel(): Id64String {
    const existingId = this.queryGroupModel();
    if (undefined !== existingId) {
      return existingId;
    }
    // Create an InformationPartitionElement for the TestConnectorGroupModel to model
    const partitionProps: InformationPartitionElementProps = {
      classFullName: GroupInformationPartition.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(this.jobSubject.id),
      code: GroupInformationPartition.createCode(this.synchronizer.imodel, this.jobSubject.id, ModelNames.Group),
    };
    const partitionId = this.synchronizer.imodel.elements.insertElement(partitionProps);

    return this.synchronizer.imodel.models.insertModel({ classFullName: TestConnectorGroupModel.classFullName, modeledElement: { id: partitionId } });
  }
  private queryGroupModel(): Id64String | undefined {
    return this.synchronizer.imodel.elements.queryElementIdByCode(GroupInformationPartition.createCode(this.synchronizer.imodel, this.jobSubject.id, ModelNames.Group));
  }
  private createPhysicalModel(): Id64String {
    const existingId = this.queryPhysicalModel();
    if (undefined !== existingId) {
      return existingId;
    }

    const modelid = PhysicalModel.insert(this.synchronizer.imodel, this.jobSubject.id, ModelNames.Physical);

    // relate this model to the source data
    const relationshipProps: RelationshipProps = {
      sourceId: modelid,
      targetId: this.repositoryLinkId,
      classFullName: "BisCore.ElementHasLinks",
    };
    this.synchronizer.imodel.relationships.insertInstance(relationshipProps);
    return modelid;
  }
  private queryPhysicalModel(): Id64String | undefined {
    return this.synchronizer.imodel.elements.queryElementIdByCode(PhysicalPartition.createCode(this.synchronizer.imodel, this.jobSubject.id, ModelNames.Physical));
  }
  private createDefinitionModel(): Id64String {
    const existingId = this.queryDefinitionModel();
    if (undefined !== existingId) {
      return existingId;
    }

    // Create an InformationPartitionElement for the TestConnectorDefinitionModel to model
    const partitionProps: InformationPartitionElementProps = {
      classFullName: DefinitionPartition.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(this.jobSubject.id),
      code: DefinitionPartition.createCode(this.synchronizer.imodel, this.jobSubject.id, ModelNames.Definition),
    };
    const partitionId = this.synchronizer.imodel.elements.insertElement(partitionProps);

    return this.synchronizer.imodel.models.insertModel({ classFullName: DefinitionModel.classFullName, modeledElement: { id: partitionId } });
  }
  private queryDefinitionModel(): Id64String | undefined {
    const code = DefinitionPartition.createCode(this.synchronizer.imodel, this.jobSubject.id, ModelNames.Definition);
    return this.synchronizer.imodel.elements.queryElementIdByCode(code);
  }
}

export function getConnectorInstance() {
  return new TestConnector();
}
