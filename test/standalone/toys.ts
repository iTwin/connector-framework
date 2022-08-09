/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type {
  Id64String,
} from "@itwin/core-bentley";

import type {
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
  DefinitionGroup,
  DefinitionModel,
  DefinitionPartition,
  ExternalSourceAspect,
  SnapshotDb,
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
  const imodel = sync.imodel;

  const results = sync.recordDocument({ docid: "source document" });
  const repository = results.elementProps;
  const source = sync.getExternalSourceElementByLinkId(repository.id!) as ExternalSourceProps;

  function put(props: ElementProps, meta: SourceItem): Id64String {
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

  const subjectId = put(subject, subjectMeta);

  const partition: InformationPartitionElementProps = {
    classFullName: DefinitionPartition.classFullName,
    code: DefinitionPartition.createCode(imodel, subjectId, "fruit definitions partition"),
    model: SnapshotDb.repositoryModelId,
    parent: new SubjectOwnsPartitionElements(subjectId),
  };

  const partitionMeta = {
    scope: IModel.rootSubjectId,
    source: repository.id,
    id: "partition",
    kind: "json",
    version: "1.0.0",
  };

  const partitionId = put(partition, partitionMeta);

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
