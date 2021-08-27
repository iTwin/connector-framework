
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, ClientRequestContext, Id64String, IModelStatus, Logger, BentleyStatus } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import {
  CategorySelector, DefinitionModel, DefinitionPartition, DisplayStyle3d, DisplayStyleCreationOptions, ElementGroupsMembers, GeometryPart, GroupInformationPartition, IModelDb, IModelJsFs,
  ModelSelector, OrthographicViewDefinition, PhysicalElement, PhysicalModel, PhysicalPartition, RelationshipProps, RenderMaterialElement, RepositoryLink, SpatialCategory, SubCategory, SubjectOwnsPartitionElements,
} from "@bentley/imodeljs-backend";
import { CodeScopeSpec, CodeSpec, ColorByName, ColorDef, ColorDefProps, GeometryPartProps, GeometryStreamBuilder, IModel, IModelError, InformationPartitionElementProps, RenderMode, SubCategoryAppearance, ViewFlags } from "@bentley/imodeljs-common";
import { Box, Cone, LinearSweep, Loop, Point3d, SolidPrimitive, StandardViewIndex, Vector3d } from "@bentley/geometry-core";

import { ItemState, SourceItem, SynchronizationResults } from "../../Synchronizer";
import { ITwinConnector } from "../../ITwinConnector";
import { TestConnectorLoggerCategory } from "./TestConnectorLoggerCategory";
import { TestConnectorSchema } from "./TestConnectorSchema";
import { TestConnectorGroupModel } from "./TestConnectorModels";
import {
  Categories, CodeSpecs, EquilateralTriangleTile, GeometryParts, IsoscelesTriangleTile, LargeSquareTile, Materials, RectangleTile, RightTriangleTile, SmallSquareTile,
  TestConnectorGroup, TestConnectorGroupProps, TestConnectorPhysicalElement,
} from "./TestConnectorElements";
import { Casings, EquilateralTriangleCasing, IsoscelesTriangleCasing, LargeSquareCasing, QuadCasing, RectangleCasing, RectangularMagnetCasing, RightTriangleCasing, SmallSquareCasing, TriangleCasing } from "./TestConnectorGeometry";

import * as hash from "object-hash";
import * as fs from "fs";
import { ConnectorLoggerCategory } from "../../connector-framework";
import { ModelNames } from "./TestITwinConnector";

const loggerCategory: string = TestConnectorLoggerCategory.Connector;

class TestConnector extends ITwinConnector {
  public async importDefinitions(): Promise<any> {
    return;
  }
  public async importDynamicSchema(requestContext?: AuthorizedClientRequestContext | ClientRequestContext | undefined): Promise<any> {
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
  private _repositoryLink?: RepositoryLink;
  public initialize(_params: any) {
    // nothing to do here
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private get repositoryLink(): RepositoryLink {
    assert(this._repositoryLink !== undefined);
    return this._repositoryLink;
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
    this._repositoryLink = documentStatus.element;
  }
  public override async onOpenIModel(): Promise<BentleyStatus> {
    throw new IModelError(IModelStatus.BadArg, "Expected Fail for test", Logger.logError, ConnectorLoggerCategory.Framework);
  }
  public async importDomainSchema(_requestContext: AuthorizedClientRequestContext | ClientRequestContext): Promise<any> {
    if (this._sourceDataState === ItemState.Unchanged) {
      return;
    }
    TestConnectorSchema.registerSchema();
    const fileName = TestConnectorSchema.schemaFilePath;
    await this.synchronizer.imodel.importSchemas(_requestContext, [fileName]);
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
      throw new IModelError(IModelStatus.BadArg, error, Logger.logError, loggerCategory);
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
      targetId: this.repositoryLink.id,
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

