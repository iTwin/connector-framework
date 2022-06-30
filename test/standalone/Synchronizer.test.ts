/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { Id64String } from "@itwin/core-bentley";

import type {
  ElementProps, ExternalSourceAspectProps, ExternalSourceProps, InformationPartitionElementProps,
  ModelProps, RepositoryLinkProps, SubjectProps,
} from "@itwin/core-common";

import { IModelError, IModelStatus } from "@itwin/core-common";

import {
  DefinitionPartition, DictionaryModel, ExternalSourceAspect, IModelJsFs,
  RepositoryLink, SnapshotDb, Subject, SubjectOwnsPartitionElements, SubjectOwnsSubjects,
} from "@itwin/core-backend";

import { assert } from "chai";
import { join } from "node:path";

import * as utils from "../ConnectorTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";

import type { SourceItem } from "../../src/Synchronizer";

import { ItemState, Synchronizer } from "../../src/Synchronizer";

describe("synchronizer #standalone", () => {
  const name = "my-fruits";
  const path = join(KnownTestLocations.outputDir, `${name}.bim`);
  const root = "root";

  const makeToyDocument = (sync: Synchronizer): ExternalSourceProps => {
    const link = sync.recordDocument(
      SnapshotDb.repositoryModelId,
      { id: "source document" },
      "json",
    );

    assert.isOk(link.elementProps.id);

    const source = sync.getExternalSourceElementByLinkId(link.elementProps.id!);

    assert.isOk(source);

    return source!;
  };

  const makeToyElement = (imodel: SnapshotDb): [Id64String, SubjectProps] => {
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

    const partitionId = imodel.elements.insertElement(partitionProps);

    const modelProps: ModelProps = {
      classFullName: DictionaryModel.classFullName,
      // TODO: No `new ModelModelsElement(partitionId)`?
      // https://www.itwinjs.org/reference/core-backend/relationships/
      modeledElement: { id: partitionId }, // The bis:Element that this bis:Model is sub-modeling
    };

    imodel.models.insertModel(modelProps);

    return [subjectId, subjectProps];
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
      const source = makeToyDocument(synchronizer);

      // TODO: An external source should probably have its own code.

      assert.isOk(source);
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

      const [elementId, _] = makeToyElement(empty);

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

    const setToyProvenance = (imodel: SnapshotDb, source: ExternalSourceProps, sync: Synchronizer): [SourceItem, ElementProps] => {
      const [_, elementProps] = makeToyElement(imodel);

      const meta: SourceItem = {
        id: identifier,
        version: "1.0.0",
      };

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

      assert.strictEqual(status, IModelStatus.Success);

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
      (elementProps as SubjectProps).description = "all about berries 🍓";

      const changes = synchronizer.detectChanges(scope, kind, meta);

      const sync = { elementProps, itemState: changes.state };

      const status = synchronizer.updateIModel(sync, scope, meta, kind, source);

      assert.strictEqual(status, IModelStatus.Success);

      const subject = empty.elements.getElement<Subject>(elementProps.id!);

      assert.strictEqual(subject.description!, "all about berries 🍓");
    });
  });
});
