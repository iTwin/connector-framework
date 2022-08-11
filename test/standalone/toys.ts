/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type {
  Id64String,
} from "@itwin/core-bentley";

import type {
  CategoryProps,
  DefinitionElementProps,
  ElementProps,
  ExternalSourceProps,
  InformationPartitionElementProps,
  ModelProps,
  RepositoryLinkProps,
  SubjectProps,
} from "@itwin/core-common";

import {
  Code,
  CodeScopeSpec,
  CodeSpec,
  IModel,
} from "@itwin/core-common";

import {
  DefinitionContainer,
  DefinitionGroup,
  DefinitionModel,
  DefinitionPartition,
  ElementOwnsChildElements,
  ExternalSourceAspect,
  SnapshotDb,
  SpatialCategory,
  Subject,
  SubjectOwnsPartitionElements,
  SubjectOwnsSubjects,
} from "@itwin/core-backend";

import type {
  SourceItem,
  SynchronizationResults,
  Synchronizer,
} from "../../src/Synchronizer";

import {
  ItemState,
} from "../../src/Synchronizer";

function put(sync: Synchronizer, props: ElementProps, meta: SourceItem): Id64String {
  const changes = sync.detectChanges(meta);
  const tree = { elementProps: props, itemState: changes.state };
  sync.updateIModel(tree, meta);

  if (!(meta.scope && meta.kind && meta.id)) {
    throw Error("fatal: incomplete external source aspect");
  }

  const found =  ExternalSourceAspect.findBySource(
    sync.imodel, meta.scope, meta.kind, meta.id
  );

  if (!found.elementId) {
    throw Error("fatal: element as given to the synchronizer but not inserted");
  }

  return found.elementId;
}

interface BerryGroups {
  repository: RepositoryLinkProps;
  source: ExternalSourceProps;
  subject: SubjectProps;
  subjectMeta: SourceItem;
  partition: InformationPartitionElementProps;
  partitionMeta: SourceItem;
  model: ModelProps;
  berryTree: SynchronizationResults;
  berryTreeMeta: SourceItem;
}

export function berryGroups(sync: Synchronizer): BerryGroups {
  //                         o - subject
  //                         |
  //    repository - o       o - partition
  //                         |
  //        source - o       o - model
  //                         |
  //   (link-table           o - definition group
  //    relationships not   / \
  //    shown)             o   o - child definition groups

  const imodel = sync.imodel;

  const results = sync.recordDocument({ docid: "source document" });
  const repository = results.elementProps;
  const source = sync.getExternalSourceElementByLinkId(repository.id!) as ExternalSourceProps;

  const subject: SubjectProps = {
    classFullName: Subject.classFullName,
    code: Subject.createCode(imodel, SnapshotDb.rootSubjectId, "fruits"),
    model: SnapshotDb.repositoryModelId,
    parent: new SubjectOwnsSubjects(SnapshotDb.rootSubjectId),
    description: "all about fruits",
  };

  const subjectMeta = {
    scope: IModel.rootSubjectId,
    source: repository.id,
    id: "subject",
    kind: "json",
    version: "1.0.0",
  };

  const subjectId = put(sync, subject, subjectMeta);

  const partition: InformationPartitionElementProps = {
    classFullName: DefinitionPartition.classFullName,
    code: DefinitionPartition.createCode(imodel, subjectId, "definitions"),
    model: SnapshotDb.repositoryModelId,
    parent: new SubjectOwnsPartitionElements(subjectId),
  };

  const partitionMeta = {
    scope: subjectId,
    source: repository.id,
    id: "partition",
    kind: "json",
    version: "1.0.0",
  };

  const partitionId = put(sync, partition, partitionMeta);

  const model: ModelProps = {
    classFullName: DefinitionModel.classFullName,
    // TODO: No `new ModelModelsElement(partitionId)`?
    // https://www.itwinjs.org/reference/core-backend/relationships/
    modeledElement: { id: partitionId }, // The bis:Element that this bis:Model is sub-modeling
  };

  const modelId = sync.imodel.models.insertModel(model);

  // TODO: Surely this is not the right way to make a code for a definition group.
  const spec = CodeSpec.create(imodel, "definition group", CodeScopeSpec.Type.Model);

  const code = (value: string) => new Code({
    scope: partitionId,
    spec: spec.name,
    value,
  });

  const berryProps: DefinitionElementProps = {
    classFullName: DefinitionGroup.classFullName,
    code: code("berries"),
    model: modelId,
    isPrivate: false,
    userLabel: "definitions of berries",
  };

  const strawberryProps: DefinitionElementProps = {
    classFullName: DefinitionGroup.classFullName,
    code: code("strawberries"),
    model: modelId,
    isPrivate: false,
    userLabel: "definitions of strawberries",
    // parent: new ElementOwnsChildElements(...),
  };

  const raspberryProps: DefinitionElementProps = {
    classFullName: DefinitionGroup.classFullName,
    code: code("raspberries"),
    model: modelId,
    isPrivate: false,
    userLabel: "definitions of raspberries",
    // parent: new ElementOwnsChildElements(...),
  };

  const berry = new DefinitionGroup(berryProps, imodel);
  const strawberry = new DefinitionGroup(strawberryProps, imodel);
  const raspberry = new DefinitionGroup(raspberryProps, imodel);

  // Sam Wilson: FYI parent/child relationships between definition groups is not what makes them
  // groups. See DefinitionGroupGroupsDefinitions. That doesn't matter for this test. ):

  const berryTreeMeta = {
    scope: partitionId,
    source: repository.id,
    id: "definition group",
    kind: "json",
    version: "1.0.0",
  };

  const berryTree: SynchronizationResults = {
    itemState: ItemState.New,
    elementProps: berry.toJSON(),
    childElements: [
      { itemState: ItemState.New, elementProps: strawberry.toJSON() },
      { itemState: ItemState.New, elementProps: raspberry.toJSON() },
    ],
  };

  // Note that `insertElement` mutates the props object you give it, so all of our elements will
  // have IDs. Hacky and dangerous to rely on, but okay for tests.

  // Also note that we haven't inserted the definition groups, only the partition and model. We've
  // only constructed the synchronizer's intermediate representation of the definition groups.

  return {
    repository,
    source,
    subject,
    subjectMeta,
    partition,
    partitionMeta,
    model,
    berryTree,
    berryTreeMeta,
  };
}

interface NestedDefinitionModels {
  subject: SubjectProps;
}

export function nestedDefinitionModels(sync: Synchronizer): NestedDefinitionModels {
  //                 o - subject
  //                 |
  //                 o - partition
  //                 |
  //                 o - model
  //                 |
  //                 o - definition container
  //                / \
  //    category - o   o - definition container
  //                   |
  //                   o - nested definition model
  //                   |
  //                   o - category

  const imodel = sync.imodel;

  const subject: SubjectProps = {
    classFullName: Subject.classFullName,
    code: Code.createEmpty(),
    model: SnapshotDb.repositoryModelId,
    parent: new SubjectOwnsSubjects(SnapshotDb.rootSubjectId),
  };

  const subjectMeta = {
    scope: IModel.rootSubjectId,
    id: "subject",
    kind: "json",
    version: "1.0.0",
  };

  const subjectId = put(sync, subject, subjectMeta);

  const partition: InformationPartitionElementProps = {
    classFullName: DefinitionPartition.classFullName,
    code: Code.createEmpty(),
    model: SnapshotDb.repositoryModelId,
    parent: new SubjectOwnsPartitionElements(subjectId),
  };

  const partitionMeta = {
    scope: subjectId,
    id: "partition",
    kind: "json",
    version: "1.0.0",
  };

  const partitionId = put(sync, partition, partitionMeta);

  const model: ModelProps = {
    classFullName: DefinitionModel.classFullName,
    modeledElement: { id: partitionId },
    parentModel: IModel.repositoryModelId,
  };

  const modelId = imodel.models.insertModel(model);

  const containerSpec = CodeSpec.create(imodel, "bis:DefinitionContainer", CodeScopeSpec.Type.Model);

  const rootContainer: DefinitionElementProps = {
    ...DefinitionContainer.create(
      imodel,
      modelId,
      new Code({scope: modelId, spec: containerSpec.id, value: "root container"}),
    ).toJSON(),
  };

  const rootContainerMeta = {
    scope: partitionId,
    id: "root container",
    kind: "json",
    version: "1.0.0",
  };

  const rootContainerId = put(sync, rootContainer, rootContainerMeta);

  const firstCategory: CategoryProps = {
    classFullName: SpatialCategory.classFullName,
    code: SpatialCategory.createCode(imodel, modelId, "first category"),
    model: modelId,
    parent: new ElementOwnsChildElements(rootContainerId),
  };

  const firstCategoryMeta = {
    scope: modelId,
    id: "first category",
    kind: "json",
    version: "1.0.0",
  };

  put(sync, firstCategory, firstCategoryMeta);

  const childContainer: DefinitionElementProps = {
    ...DefinitionContainer.create(
      imodel,
      modelId,
      new Code({scope: modelId, spec: containerSpec.id, value: "child container"}),
    ).toJSON(),
  };

  const childContainerMeta = {
    scope: rootContainerId,
    id: "child container",
    kind: "json",
    version: "1.0.0",
  };

  const childContainerId = put(sync, childContainer, childContainerMeta);

  const nestedModel: ModelProps = {
    classFullName: DefinitionModel.classFullName,
    modeledElement: { id: childContainerId },
    parentModel: modelId,
  };

  const nestedModelId = imodel.models.insertModel(nestedModel);

  const childCategory: CategoryProps = {
    classFullName: SpatialCategory.classFullName,
    code: SpatialCategory.createCode(imodel, modelId, "second category"),
    model: nestedModelId,
  };

  const childCategoryMeta = {
    scope: modelId,
    id: "second category",
    kind: "json",
    version: "1.0.0",
  };

  put(sync, childCategory, childCategoryMeta);

  return { subject };
}
