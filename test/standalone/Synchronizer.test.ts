/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { Id64String } from "@itwin/core-bentley";

import type {
  ExternalSourceAspectProps, InformationPartitionElementProps,
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

  const makeToyElement = (imodel: SnapshotDb): Id64String => {
    const subjectProps: SubjectProps = {
      classFullName: Subject.classFullName,
      code: Subject.createCode(imodel, SnapshotDb.rootSubjectId, "fruits"),
      model: SnapshotDb.repositoryModelId,
      parent: new SubjectOwnsSubjects(SnapshotDb.rootSubjectId),
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

    const modelId = imodel.models.insertModel(modelProps);

    return modelId;
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

  it("external source is in repository", () => {
    const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
    const synchronizer = new Synchronizer(empty, false);

    const link = synchronizer.recordDocument(
      SnapshotDb.repositoryModelId,
      { id: "source document"},
      "json"
    );

    assert.isOk(link.elementProps.id);
    assert.strictEqual(link.elementProps.userLabel, "source document");

    const source = synchronizer.getExternalSourceElementByLinkId(link.elementProps.id!);

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

    let failure = false;

    try {
      synchronizer.recordDocument(
        SnapshotDb.repositoryModelId,
        { id: document },
        "json"
      );
    } catch (oops) {
      assert.instanceOf(oops, IModelError);
      assert.strictEqual((oops as IModelError).errorNumber, IModelStatus.NotFound);
      failure = true;
    }

    assert.isTrue(failure);
  });

  it("detect version change and checksum change", () => {
    const empty = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
    const synchronizer = new Synchronizer(empty, false);

    // The element referenced by the external source.
    const identifier = "fruit definitions model";
    const kind = "model";
    const scope = SnapshotDb.repositoryModelId;

    const link = synchronizer.recordDocument(
      SnapshotDb.repositoryModelId,
      { id: "source document" },
      "json",
    );

    assert.isOk(link.elementProps.id);

    const source = synchronizer.getExternalSourceElementByLinkId(link.elementProps.id!);

    assert.isOk(source);

    const elementId = makeToyElement(empty);

    const aspectProps: ExternalSourceAspectProps = {
      classFullName: ExternalSourceAspect.classFullName,
      element: { id: elementId },  // The bis:Element that owns this bis:ElementMultiAspect.
      identifier,                  // The document's external identifier.
      kind,                        // TODO: This information is duplicated by the element relationship?
      source: { id: source!.id! }, // The external source from which this element originated.
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
