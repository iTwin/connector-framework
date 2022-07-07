/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { Id64String } from "@itwin/core-bentley";

import type { DefinitionElementProps, ExternalSourceAspectProps, ExternalSourceProps,
  InformationPartitionElementProps, ModelProps, RepositoryLinkProps, SubjectProps,
} from "@itwin/core-common";

import { Code, IModelError, IModelStatus } from "@itwin/core-common";

import {
  DefinitionGroup,
  DefinitionPartition, DictionaryModel, ExternalSourceAspect, IModelJsFs,
  RepositoryLink, SnapshotDb, Subject, SubjectOwnsPartitionElements, SubjectOwnsSubjects,
} from "@itwin/core-backend";

import { assert } from "chai";
import { join } from "node:path";

import * as utils from "../ConnectorTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";

import type { SourceItem, SynchronizationResults} from "../../src/Synchronizer";

import { ItemState, Synchronizer } from "../../src/Synchronizer";

describe("synchronizer #standalone", () => {
  const name = "my-fruits";
  const path = join(KnownTestLocations.outputDir, `${name}.bim`);
  const root = "root";

  const makeToyDocument = (sync: Synchronizer): ExternalSourceProps => {
    const results = sync.recordDocument(
      SnapshotDb.repositoryModelId,
      { id: "source document" },
      "json",
    );

    const linkId = results.elementProps.id;

    assert.isOk(linkId);

    const source = sync.getExternalSourceElementByLinkId(linkId!);

    assert.isOk(source);

    assert.strictEqual(source!.repository!.id, linkId!);

    return source!;
  };

  const makeToyElement = (imodel: SnapshotDb): [Id64String, SubjectProps, Id64String, Id64String] => {
    const subjectProps: SubjectProps = {
      classFullName: Subject.classFullName,
      code: Subject.createCode(imodel, SnapshotDb.rootSubjectId, "fruits"),
      model: SnapshotDb.repositoryModelId,
      parent: new SubjectOwnsSubjects(SnapshotDb.rootSubjectId),
      description: "all about fruits",
    };

    const subjectId = imodel.elements.insertElement(subjectProps);

    const partitionProps: InformationPartitionElementProps = {
      classFullName: DefinitionPartition.classFullName,
      code: DefinitionPartition.createCode(imodel, subjectId, "fruit definitions partition"),
      model: SnapshotDb.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(subjectId),
    };

    const partitionId = imodel.elements.insertElement(new DefinitionPartition(partitionProps, imodel).toJSON());

    const modelProps: ModelProps = {
      classFullName: DictionaryModel.classFullName,
      // TODO: No `new ModelModelsElement(partitionId)`?
      // https://www.itwinjs.org/reference/core-backend/relationships/
      modeledElement: { id: partitionId }, // The bis:Element that this bis:Model is sub-modeling
    };

    const modelId = imodel.models.insertModel(modelProps);

    return [subjectId, subjectProps, partitionId, modelId];
  };

  const berryGroups = (imodel: SnapshotDb, definitionModel: Id64String): [SourceItem, SynchronizationResults] => {
    const meta: SourceItem = {
      id: "berry definition group",
      version: "1.0.0",
    };

    const modelId = definitionModel;

    const berryProps: DefinitionElementProps = {
      classFullName: DefinitionGroup.classFullName,
      code: Code.createEmpty(),
      model: modelId,
      isPrivate: false,
      userLabel: "definitions of berries",
    };

    const strawberryProps: DefinitionElementProps = {
      classFullName: DefinitionGroup.classFullName,
      code: Code.createEmpty(),
      model: modelId,
      isPrivate: false,
      userLabel: "definitions of strawberries",
      // parent: new ElementOwnsChildElements(...),
    };

    const raspberryProps: DefinitionElementProps = {
      classFullName: DefinitionGroup.classFullName,
      code: Code.createEmpty(),
      model: modelId,
      isPrivate: false,
      userLabel: "definitions of raspberries",
      // parent: new ElementOwnsChildElements(...),
    };

    const berry = new DefinitionGroup(berryProps, imodel);
    const strawberry = new DefinitionGroup(strawberryProps, imodel);
    const raspberry = new DefinitionGroup(raspberryProps, imodel);

    const tree: SynchronizationResults = {
      itemState: ItemState.New,
      elementProps: berry.toJSON(),
      childElements: [
        { itemState: ItemState.New, elementProps: strawberry.toJSON() },
        { itemState: ItemState.New, elementProps: raspberry.toJSON() },
      ],
    };

    return [meta, tree];
  };

  const sourceAspect = (imodel: SnapshotDb, scope: Id64String, kind: string, externalIdentifier: Id64String) => {
    const { aspectId } = ExternalSourceAspect.findBySource(imodel, scope, kind, externalIdentifier);
    assert.isOk(aspectId);
    return imodel.elements.getAspect(aspectId!) as ExternalSourceAspect;
  };

  const count = (imodel: SnapshotDb, query: string, times: number): void => {
    imodel.withStatement<void>(query, (statement) => {
      statement.step();
      assert.strictEqual(statement.getValue(0).getInteger(), times);
    });
  };

  before(async () => {
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir)) {
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
    }

    await utils.startBackend();
    utils.setupLogging();
  });

  after(async () => {
    await utils.shutdownBackend();
  });

  afterEach(() => {
    IModelJsFs.unlinkSync(path);
  });

  describe("record document", () => {
    it("external source is in repository", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);
      makeToyDocument(synchronizer);
    });

    it("return unmodified document", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);

      const poke = () =>
        synchronizer.recordDocument(
          SnapshotDb.repositoryModelId,
          { id: "source document"},
          "json"
        );

      // Access the document again without modifying it. Expect synchronization results to be the same
      // object because the synchronizer maintains a cache.
      assert.equal(poke(), poke());
    });

    it("repository link already exists", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);
      const document = "source document";

      // `getRepositoryLinkInfo` eventually defaults to using the document source identifier as the
      // code value of the repository, which uniquely identifies it along with its kind.

      const linkProps: RepositoryLinkProps = {
        classFullName: RepositoryLink.classFullName,
        code: RepositoryLink.createCode(empty, SnapshotDb.repositoryModelId, document),
        model: SnapshotDb.repositoryModelId,
      };

      empty.elements.insertElement(linkProps);

      const oops = () => {
        synchronizer.recordDocument(
          SnapshotDb.repositoryModelId,
          { id: document },
          "json"
        );
      };

      assert.throws(oops, IModelError, /Maybe RecordDocument was previously called/i);
    });
  });

  describe("detect changes", () => {
    it("detect version change and checksum change", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);

      // The element referenced by the external source.
      const identifier = "fruit subject";
      const kind = "subject";
      const scope = SnapshotDb.repositoryModelId;

      const source = makeToyDocument(synchronizer);

      const [elementId,,,,] = makeToyElement(empty);

      const aspectProps: ExternalSourceAspectProps = {
        classFullName: ExternalSourceAspect.classFullName,
        element: { id: elementId },  // The bis:Element that owns this bis:ElementMultiAspect.
        identifier,                  // The document's external identifier.
        kind,                        // TODO: This information is duplicated by the element relationship?
        source: { id: source.id! }, // The external source from which this element originated.
        scope: { id: scope },
        version: "1.0.0",
        checksum: "01111010011000010110001101101000",
      };

      empty.elements.insertAspect(aspectProps);

      // Version change takes priority over a checksum change.

      let edited: SourceItem = {
        id: identifier,
        version: "1.0.1",
        checksum: "01111010011000010110001101101001",
      };

      let changes = synchronizer.detectChanges(scope, kind, edited);

      assert.strictEqual(changes.id, elementId);
      assert.strictEqual(changes.state, ItemState.Changed);

      // Checksum change.

      edited = {
        id: identifier,
        version: "1.0.0",
        checksum: "01111010011000010110001101101001",
      };

      changes = synchronizer.detectChanges(scope, kind, edited);

      assert.strictEqual(changes.id, elementId);
      assert.strictEqual(changes.state, ItemState.Changed);

      // No change.

      edited = {
        id: identifier,
        version: "1.0.0",
        checksum: "01111010011000010110001101101000",
      };

      changes = synchronizer.detectChanges(scope, kind, edited);

      assert.strictEqual(changes.id, elementId);
      assert.strictEqual(changes.state, ItemState.Unchanged);
    });
  });

  describe("update imodel", () => {
    // The element referenced by the external source.
    const identifier = "fruit subject";
    const kind = "subject";
    const scope = SnapshotDb.repositoryModelId;

    const setToyProvenance = (imodel: SnapshotDb, source: ExternalSourceProps, sync: Synchronizer): [SourceItem, SubjectProps] => {
      const [, elementProps,,,] = makeToyElement(imodel);

      const meta: SourceItem = {
        id: identifier,
        version: "1.0.0",
      };

      // TODO: Or call `updateIModel`.
      const status = sync.setExternalSourceAspect(
        elementProps, ItemState.New, scope, meta, kind, source.id
      );

      assert.strictEqual(status, IModelStatus.Success);

      return [meta, elementProps];
    };

    it("update imodel with unchanged element", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);
      const source = makeToyDocument(synchronizer);

      const [meta, elementProps] = setToyProvenance(empty, source, synchronizer);
      const changes = synchronizer.detectChanges(scope, kind, meta);
      const sync = { elementProps, itemState: changes.state };
      const status = synchronizer.updateIModel(sync, scope, meta, kind, source);
      const aspect = sourceAspect(empty, scope, kind, identifier);

      assert.strictEqual(status, IModelStatus.Success);
      assert.strictEqual(aspect.version!, "1.0.0");

      // Butcher element identifier.
      sync.elementProps.id = undefined;

      const oops = () => synchronizer.updateIModel(sync, scope, meta, kind, source);

      assert.throws(oops, IModelError, /missing id/i);
    });

    it("update imodel with changed element", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);
      const source = makeToyDocument(synchronizer);

      const [meta, elementProps] = setToyProvenance(empty, source, synchronizer);

      // New patch for our subject element from the source document!
      meta.version = "1.0.1";
      elementProps.description = "all about berries 🍓";

      const changes = synchronizer.detectChanges(scope, kind, meta);
      const sync = { elementProps, itemState: changes.state };
      const status = synchronizer.updateIModel(sync, scope, meta, kind, source);

      assert.strictEqual(status, IModelStatus.Success);

      const subject = empty.elements.getElement<Subject>(elementProps.id!);
      const aspect = sourceAspect(empty, scope, kind, identifier);

      assert.strictEqual(subject.description!, "all about berries 🍓");
      assert.strictEqual(aspect.version!, "1.0.1");
    });
  });

  describe("insert results into imodel", () => {
    it("insert new child elements", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);

      const [,,, modelId] = makeToyElement(empty);
      const [, tree] = berryGroups(empty, modelId);

      const status = synchronizer.insertResultsIntoIModel(tree);

      assert.strictEqual(status, IModelStatus.Success);

      count(empty, "select count(*) from bis:DefinitionGroup", 3);
    });
  });

  describe("update results in imodel", () => {
    it("update modified root element with children, one-to-one", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);
      const source = makeToyDocument(synchronizer);

      const [,,, modelId] = makeToyElement(empty);
      const [meta, tree] = berryGroups(empty, modelId);

      const scope = SnapshotDb.repositoryModelId;
      const kind = "definition group";

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      // Change the external identifier of the root definition group. The synchronizer will consider
      // the root group (berry) and the children groups (strawberry, raspberry) modified even though
      // only the root element has changed. TODO. This is probably not desirable behavior. Once the
      // synchronizer sees that the root element has changed, it will fall into a recursive update
      // operation.

      // Patch berry definition group.
      meta.version = "1.0.1";
      tree.childElements![0].elementProps.userLabel = "definitions of boysenberries";

      tree.childElements![0].itemState = ItemState.Changed;
      tree.childElements![1].itemState = ItemState.Unchanged;

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel='definitions of ${label}'`;

      count(empty, query("boysenberries"), 1);
      count(empty, query("raspberries"), 1);
    });

    it("update modified root element with children, larger source set", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      const synchronizer = new Synchronizer(empty, false);
      const source = makeToyDocument(synchronizer);

      const [,,, modelId] = makeToyElement(empty);
      const [meta, tree] = berryGroups(empty, modelId);

      const scope = SnapshotDb.repositoryModelId;
      const kind = "definition group";

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      const blueberryProps = new DefinitionGroup({
        classFullName: DefinitionGroup.classFullName,
        code: Code.createEmpty(),
        model: modelId,
        isPrivate: false,
        userLabel: "definitions of blueberries",
        // parent: new ElementOwnsChildElements(...),
      }, empty);

      tree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryProps.toJSON(),
      });

      tree.childElements![0].itemState = ItemState.Unchanged;
      tree.childElements![1].itemState = ItemState.Unchanged;
      tree.childElements![2].itemState = ItemState.New;

      // Patch berry definition group.
      meta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel='definitions of ${label}'`;

      count(empty, query("strawberries"), 1);
      count(empty, query("raspberries"), 1);
      count(empty, query("blueberries"), 1);
    });
  });

  describe("detect deleted elements", () => {
    it("deletes child that is not visited", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      let synchronizer = new Synchronizer(empty, false);
      let source = makeToyDocument(synchronizer);

      const [,,, modelId] = makeToyElement(empty);
      const [meta, tree] = berryGroups(empty, modelId);

      const scope = SnapshotDb.repositoryModelId;
      const kind = "definition group";

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel='definitions of ${label}'`;

      count(empty, query("berries"), 1);
      count(empty, query("strawberries"), 1);
      count(empty, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      synchronizer = new Synchronizer(empty, false);

      source = makeToyDocument(synchronizer);

      // Delete an element in the source file.
      tree.childElements!.pop();

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      assert.strictEqual(synchronizer.deleteInChannel(modelId), IModelStatus.Success);

      count(empty, query("berries"), 1);
      count(empty, query("strawberries"), 1);
      count(empty, query("raspberries"), 0);
    });

    it("deletes all children of an element", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      let synchronizer = new Synchronizer(empty, false);
      let source = makeToyDocument(synchronizer);

      const [,,, modelId] = makeToyElement(empty);
      const [meta, tree] = berryGroups(empty, modelId);

      const scope = SnapshotDb.repositoryModelId;
      const kind = "definition group";

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel='definitions of ${label}'`;

      count(empty, query("berries"), 1);
      count(empty, query("strawberries"), 1);
      count(empty, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      synchronizer = new Synchronizer(empty, false);

      source = makeToyDocument(synchronizer);

      // Delete an element in the source file.
      tree.childElements = [];

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      assert.strictEqual(synchronizer.deleteInChannel(modelId), IModelStatus.Success);

      count(empty, query("berries"), 1);
      count(empty, query("strawberries"), 0);
      count(empty, query("raspberries"), 0);
    });

    it("deletes a model with no children elements", () => {
      const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
      let synchronizer = new Synchronizer(empty, false);
      let source = makeToyDocument(synchronizer);

      const [,, partitionId, modelId] = makeToyElement(empty);
      const [meta, tree] = berryGroups(empty, modelId);

      // TODO: What on earth is this? ❗❗❗❗❗
      assert.strictEqual(partitionId, modelId);

      const scope = SnapshotDb.repositoryModelId;
      const kind = "definition group";

      assert.strictEqual(synchronizer.updateIModel(tree, scope, meta, kind, source), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel='definitions of ${label}'`;

      count(empty, query("berries"), 1);
      count(empty, query("strawberries"), 1);
      count(empty, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      synchronizer = new Synchronizer(empty, false);

      source = makeToyDocument(synchronizer);

      // Delete an element in the source file.
      // tree = *poof!*;

      assert.strictEqual(synchronizer.deleteInChannel(modelId), IModelStatus.Success);

      count(empty, query("berries"), 0);
      count(empty, query("strawberries"), 0);
      count(empty, query("raspberries"), 0);

      const deletedModeledElement = empty.elements.tryGetElement(partitionId);
      const deletedModel = empty.models.tryGetModel(modelId);

      assert.isNotOk(deletedModeledElement);
      assert.isNotOk(deletedModel);
    });
  });
});
