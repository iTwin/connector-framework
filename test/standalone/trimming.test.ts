/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type {
  ElementProps,
} from "@itwin/core-common";

import {
  Code,
  IModelStatus,
} from "@itwin/core-common";

import type {
  IModelDb,
} from "@itwin/core-backend";

import {
  Category,
  DefinitionContainer,
  DefinitionModel,
  DefinitionPartition,
  Subject,
} from "@itwin/core-backend";

import {
  ElementGroupsMembers,
  Group,
  SnapshotDb,
} from "@itwin/core-backend";

import { assert } from "chai";
import { join } from "node:path";

import * as fs from "node:fs";

import * as utils from "../ConnectorTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";

import { Synchronizer } from "../../src/Synchronizer";

import { berryGroups, nestedDefinitionModels } from "./toys";

const count = (imodel: IModelDb, query: string, times: number): void => {
  imodel.withStatement<void>(query, (statement) => {
    statement.step();
    assert.strictEqual(statement.getValue(0).getInteger(), times);
  });
};

describe("trimming #standalone", () => {
  const name = "trimming";
  const path = join(KnownTestLocations.outputDir, `${name}.bim`);
  const root = "root";

  let imodel: SnapshotDb;

  before(async () => {
    if (!fs.existsSync(KnownTestLocations.outputDir)) {
      fs.mkdirSync(KnownTestLocations.outputDir);
    }

    await utils.startBackend();
    utils.setupLogging();
  });

  after(async () => {
    await utils.shutdownBackend();
  });

  beforeEach(() => {
    if (fs.existsSync(path)) {
      fs.rmSync(path);
    }
    imodel = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
  });

  afterEach(() => {
    imodel.saveChanges("unit test complete");
    imodel.close();
    fs.rmSync(path, { maxRetries: 2, retryDelay: 2 * 1000 });
  });

  describe("a single tree of definition groups", () => {
    it("deletes child that is not visited", () => {
      let synchronizer = new Synchronizer(imodel, false);
      const { subject, partition, partitionMeta, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 1);
      count(imodel, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      synchronizer = new Synchronizer(imodel, false);

      // Delete an element in the source file.
      berryTree.childElements!.pop();

      // Be careful! If we forget to sync the partition on the second run, because the subtree
      // selector goes from the root to the leaves, top-down, the whole partition will be
      // deleted. Once the subtree selector delegates to the tree deleter, the subtree is gone,
      // regardless of the filters set on the children.

      assert.strictEqual(synchronizer.updateIModel({
        elementProps: partition, itemState: synchronizer.detectChanges(partitionMeta).state,
      }, partitionMeta), IModelStatus.Success);
      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      synchronizer.jobSubjectId = subject.id!;
      synchronizer.detectDeletedElementsInChannel();

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 1);
      count(imodel, query("raspberries"), 0);
    });

    it("deletes all children of an element", () => {
      let synchronizer = new Synchronizer(imodel, false);
      const { subject, partition, partitionMeta, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 1);
      count(imodel, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      synchronizer = new Synchronizer(imodel, false);

      // Delete the children elements in the source file.
      berryTree.childElements = [];

      assert.strictEqual(synchronizer.updateIModel({
        elementProps: partition, itemState: synchronizer.detectChanges(partitionMeta).state,
      }, partitionMeta), IModelStatus.Success);
      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      synchronizer.jobSubjectId = subject.id!;
      synchronizer.detectDeletedElementsInChannel();

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 0);
      count(imodel, query("raspberries"), 0);
    });

    it("deletes a model with no children elements", () => {
      let synchronizer = new Synchronizer(imodel, false);
      const { subject, model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 1);
      count(imodel, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      // Delete all elements in the source file. I.e.,
      // Don't update any elements => no elements are seen => all will be detected as deleted.
      synchronizer = new Synchronizer(imodel, false);

      synchronizer.jobSubjectId = subject.id!;
      synchronizer.detectDeletedElementsInChannel();

      count(imodel, query("berries"), 0);
      count(imodel, query("strawberries"), 0);
      count(imodel, query("raspberries"), 0);

      const deletedModeledElement = imodel.elements.tryGetElement(model.id!);
      const deletedModel = imodel.models.tryGetModel(model.id!);

      assert.notExists(deletedModeledElement);
      assert.notExists(deletedModel);
    });

    it("deletes elements with link-table relationship", () => {
      let synchronizer = new Synchronizer(imodel, false);
      const { subject, partition, partitionMeta, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      const berryBasket: ElementProps = {
        classFullName: Group.classFullName,
        code: Code.createEmpty(),
        model: SnapshotDb.repositoryModelId,
        userLabel: "a basket of berries",
      };

      const basketId = imodel.elements.insertElement(berryBasket);

      //   o <---+
      //  / \    |---o berry basket (referencing strength)
      // o   o <-+

      const berry = berryTree.childElements![1].elementProps.id!;
      ElementGroupsMembers.create(imodel, basketId, berryTree.elementProps.id!).insert();
      ElementGroupsMembers.create(imodel, basketId, berry).insert();

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 1);
      count(imodel, query("raspberries"), 1);

      // We construct a new synchronizer to simulate another run.
      synchronizer = new Synchronizer(imodel, false);

      // Delete the children in the source file.
      berryTree.childElements = [];

      assert.strictEqual(synchronizer.updateIModel({
        elementProps: partition, itemState: synchronizer.detectChanges(partitionMeta).state,
      }, partitionMeta), IModelStatus.Success);
      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      synchronizer.jobSubjectId = subject.id!;
      synchronizer.detectDeletedElementsInChannel();

      // Assert that the berry basket still exists.
      assert.exists(imodel.elements.tryGetElement(basketId));

      count(imodel, query("berries"), 1);
      count(imodel, query("strawberries"), 0);
      count(imodel, query("raspberries"), 0);
    });
  });

  it("fail nested definition models", () => {
    let sync = new Synchronizer(imodel, false);

    // Write to the iModel!
    const { subject } = nestedDefinitionModels(sync);

    const query = (fullClass: string) => `select count(*) from ${fullClass}`;

    // Assert that the synchronizer inserted everything as intended.
    count(imodel, query(Subject.classFullName), 2);             // +1 for root subject
    count(imodel, query(DefinitionPartition.classFullName), 2); // +1 for dictionary partition
    count(imodel, query(DefinitionModel.classFullName), 4);     // +1 for dictionary model, +1 for repository model
    count(imodel, query(DefinitionContainer.classFullName), 2);
    count(imodel, query(Category.classFullName), 2);

    // Okay, let's move this definition model to a different subject in the source file. We expect
    // everything to be deleted.

    sync = new Synchronizer(imodel, false);

    sync.jobSubjectId = subject.id!;
    assert.throws(
      () => sync.detectDeletedElementsInChannel(),
      /Error deleting element/i
    );
  });
});
