/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Code, ExternalSourceAspectProps, IModelError, IModelStatus, RepositoryLinkProps } from "@itwin/core-common";
import { DefinitionGroup, ExternalSourceAspect, RepositoryLink, SnapshotDb, Subject } from "@itwin/core-backend";
import { assert } from "chai";
import { join } from "path";
import * as fs from "fs";
import * as utils from "../ConnectorTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { ItemState, SourceItem, Synchronizer } from "../../src/Synchronizer";
import { berryGroups } from "./toys";
import {after, before} from "mocha";

describe("synchronizer #standalone", () => {
  const name = "my-fruits";
  const path = join(KnownTestLocations.outputDir, `${name}.bim`);
  const root = "root";

  let imodel: SnapshotDb;

  const sourceAspect = (meta: SourceItem) => {
    assert.exists(meta.scope), assert.exists(meta.kind), assert.exists(meta.id);
    const ids = ExternalSourceAspect.findAllBySource(imodel, meta.scope!, meta.kind!, meta.id);
    const aspectId = ids[0]?.aspectId;
    assert.exists(aspectId);
    return imodel.elements.getAspect(aspectId) as ExternalSourceAspect;
  };

  const count = (query: string, times: number): void => {
    imodel.withStatement<void>(query, (statement) => {
      statement.step();
      assert.strictEqual(statement.getValue(0).getInteger(), times);
    });
  };

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
    if (fs.existsSync(path))
      fs.rmSync(path);
    imodel = SnapshotDb.createEmpty(path, { name, rootSubject: { name: root } });
  });

  afterEach(() => {
    imodel.close();
    fs.rmSync(path, { maxRetries: 2, retryDelay: 2 * 1000 });
  });

  describe("record document", () => {
    it("external source is in repository", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { repository, source } = berryGroups(synchronizer);

      assert.exists(repository.id);
      assert.exists(source.id);

      assert.strictEqual(source.repository?.id, repository.id);

    });

    it("return unmodified document", () => {
      const synchronizer = new Synchronizer(imodel, false);

      const poke = () =>
        synchronizer.recordDocument({ docid: "source document" });

      // Access the document again without modifying it. Expect synchronization results to be the same
      // object because the synchronizer maintains a cache.
      assert.equal(poke(), poke());
    });

    it("repository link already exists", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const document = "source document";

      // `getRepositoryLinkInfo` eventually defaults to using the document source identifier as the
      // code value of the repository, which uniquely identifies it along with its kind.

      const linkProps: RepositoryLinkProps = {
        classFullName: RepositoryLink.classFullName,
        code: RepositoryLink.createCode(imodel, SnapshotDb.repositoryModelId, document),
        model: SnapshotDb.repositoryModelId,
      };

      imodel.elements.insertElement(linkProps);

      const oops = () => {
        synchronizer.recordDocument({ docid: document });
      };

      // Chai's documentation: https://www.chaijs.com/api/assert/#method_throws
      // The third parameter can be a regular expression object. We use literal notation.
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp
      assert.throws(oops, IModelError, /Maybe RecordDocument was previously called/i);
    });
  });

  describe("detect changes", () => {
    it("detect version change and checksum change", () => {
      const synchronizer = new Synchronizer(imodel, false);

      // The element referenced by the external source.
      const identifier = "fruit subject";
      const kind = "subject";
      const scope = SnapshotDb.repositoryModelId;

      const { source, subject } = berryGroups(synchronizer);
      assert.exists(subject.id);

      const aspectProps: ExternalSourceAspectProps = {
        classFullName: ExternalSourceAspect.classFullName,
        element: { id: subject.id! },
        identifier,
        kind,
        source: { id: source.id! },
        scope: { id: scope },
        version: "1.0.0",
        checksum: "01111010011000010110001101101000",
      };

      imodel.elements.insertAspect(aspectProps);

      // If both are defined, version is used only to detect *no change*. When versions differ, checksums are compared.

      // case: version unchanged
      let edited: SourceItem = {
        scope,
        kind,
        id: identifier,
        version: "1.0.0",
        checksum: () => { throw new Error("never called"); }, // never called
      };

      let changes = synchronizer.detectChanges(edited);

      assert.strictEqual(changes.id, subject.id);
      assert.strictEqual(changes.state, ItemState.Unchanged);

      // case: version changed, checksum unchanged
      edited = {
        scope,
        kind,
        id: identifier,
        version: "1.0.1",
        checksum: () => "01111010011000010110001101101000",
      };

      changes = synchronizer.detectChanges(edited);

      assert.strictEqual(changes.id, subject.id);
      assert.strictEqual(changes.state, ItemState.Unchanged);

      // case: both version and checksum changed
      edited = {
        scope,
        kind,
        id: identifier,
        version: "1.0.1",
        checksum: () => "01111010011000010110001101101001",
      };

      changes = synchronizer.detectChanges(edited);

      assert.strictEqual(changes.id, subject.id);
      assert.strictEqual(changes.state, ItemState.Changed);

      // case: no version; checksum changed
      edited = {
        scope,
        kind,
        id: identifier,
        version: undefined,
        checksum: () => "01111010011000010110001101101001",
      };

      changes = synchronizer.detectChanges(edited);

      assert.strictEqual(changes.id, subject.id);
      assert.strictEqual(changes.state, ItemState.Changed);

      // case: version; no checksum
      edited = {
        scope,
        kind,
        id: identifier,
        version: "1.0.1",
      };

      changes = synchronizer.detectChanges(edited);

      assert.strictEqual(changes.id, subject.id);
      assert.strictEqual(changes.state, ItemState.Changed);
    });
  });

  describe("update imodel", () => {
    it("update imodel with unchanged element", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { subject, subjectMeta } = berryGroups(synchronizer);

      const changes = synchronizer.detectChanges(subjectMeta);
      const sync = { elementProps: subject, itemState: changes.state };
      const status = synchronizer.updateIModel(sync, subjectMeta);
      const aspect = sourceAspect(subjectMeta);

      assert.strictEqual(status, IModelStatus.Success);
      assert.strictEqual(aspect.version!, "1.0.0");

      // Butcher element identifier.
      sync.elementProps.id = undefined;

      const oops = () => synchronizer.updateIModel(sync, subjectMeta);

      assert.throws(oops, IModelError, /missing id/i);
    });

    it("update imodel with changed element", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { subject, subjectMeta } = berryGroups(synchronizer);

      // New patch for our subject element from the source document!
      subjectMeta.version = "1.0.1";
      subject.description = "all about berries 🍓";

      const changes = synchronizer.detectChanges(subjectMeta);
      const sync = { elementProps: subject, itemState: changes.state };
      const status = synchronizer.updateIModel(sync, subjectMeta);

      assert.strictEqual(status, IModelStatus.Success);

      const found = imodel.elements.getElement<Subject>(subject.id!);
      const aspect = sourceAspect(subjectMeta);

      assert.strictEqual(found.description!, "all about berries 🍓");
      assert.strictEqual(aspect.version!, "1.0.1");
    });
  });

  describe("insert results into imodel", () => {
    it("insert new child elements", () => {
      const synchronizer = new Synchronizer(imodel, false);

      const { berryTree, berryTreeMeta } = berryGroups(synchronizer);

      const status = synchronizer.insertResultsIntoIModel(berryTree, synchronizer.makeExternalSourceAspectProps(berryTreeMeta));

      assert.strictEqual(status, IModelStatus.Success);

      count("select count(*) from bis:DefinitionGroup", 3);
    });
  });

  describe("update results in imodel", () => {
    it("update modified root element with children, one-to-one", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      // Change the external identifier of the root definition group. The synchronizer will consider
      // the root group (berry) and the children groups (strawberry, raspberry) modified even though
      // only the root element has changed. TODO. This is probably not desirable behavior. Once the
      // synchronizer sees that the root element has changed, it will fall into a recursive update
      // operation.

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";
      berryTree.childElements![0].elementProps.userLabel = "definitions of boysenberries";

      berryTree.childElements![0].itemState = ItemState.Changed;
      berryTree.childElements![1].itemState = ItemState.Unchanged;

      // Synchronizer does not care if we've actually changed the element, it will just look at what
      // we've specified here.
      //                                           vvvvvvvvv
      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("boysenberries"), 1);
      count(query("raspberries"), 1);
    });

    it("update modified root element with children, larger-source-set", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
      blueberryProps.userLabel = "definitions of blueberries";

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryProps.toJSON(),
      });

      berryTree.childElements![0].itemState = ItemState.Unchanged;
      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![2].itemState = ItemState.New;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("strawberries"), 1);
      count(query("raspberries"), 1);
      count(query("blueberries"), 1);
    });

    it("update modified ..., larger ... but w/ new child element first in list", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
      blueberryProps.userLabel = "definitions of blueberries";

      berryTree.childElements!.unshift({
        itemState: ItemState.New,
        elementProps: blueberryProps.toJSON(),
      });

      berryTree.childElements![0].itemState = ItemState.New;
      berryTree.childElements![0].elementProps.id = undefined;
      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![2].itemState = ItemState.Unchanged;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("strawberries"), 1);
      count(query("raspberries"), 1);
      count(query("blueberries"), 1);
    });

    it("update modified ..., larger ... but w/ one new child elements and no id", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
      blueberryProps.userLabel = "definitions of blueberries";

      berryTree.childElements!.pop ();
      berryTree.childElements!.pop ();

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryProps.toJSON(),
      });

      berryTree.childElements![0].itemState = ItemState.New;
      berryTree.childElements![0].elementProps.id = undefined;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("blueberries"), 1);
    });

    it("update modified ..., larger ... and w/ existing child elements but all missing ids", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
      blueberryProps.userLabel = "definitions of blueberries";

      // wipe out ids so it falls into no ids case
      berryTree.childElements![0].itemState = ItemState.Unchanged;
      berryTree.childElements![0].elementProps.id = undefined;
      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![1].elementProps.id = undefined;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("strawberries"), 1);
      count(query("raspberries"), 1);
    });

    it("update modified ..., larger ... but w/ existing child elements and several new elements interspersed all missing ids", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryPropsArr: DefinitionGroup[] = [];

      for (let i = 0; i < 4; i++) {
        const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
        blueberryProps.userLabel = `definitions of blueberries`;
        blueberryPropsArr.push(blueberryProps);
      }

      const poppedChild = berryTree.childElements!.pop ();

      berryTree.childElements!.unshift({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[0].toJSON(),
      });

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[1].toJSON(),
      });

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[2].toJSON(),
      });

      berryTree.childElements!.push(poppedChild!);

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[3].toJSON(),
      });

      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![1].elementProps.id = undefined;
      berryTree.childElements![4].itemState = ItemState.Unchanged;
      berryTree.childElements![4].elementProps.id = undefined;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("blueberries"), 4);
      count(query("strawberries"), 1);
      count(query("raspberries"), 1);
    });

    it("update modified ..., larger ... but w/ existing child elements and several new elements interspersed w Ids", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryPropsArr: DefinitionGroup[] = [];

      for (let i = 0; i < 4; i++) {
        const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
        blueberryProps.userLabel = `definitions of blueberries`;
        blueberryPropsArr.push(blueberryProps);
      }

      const poppedChild = berryTree.childElements!.pop ();

      berryTree.childElements!.unshift({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[0].toJSON(),
      });

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[1].toJSON(),
      });

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[2].toJSON(),
      });

      berryTree.childElements!.push(poppedChild!);

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[3].toJSON(),
      });

      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![4].itemState = ItemState.Unchanged;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("blueberries"), 4);
      count(query("strawberries"), 1);
      count(query("raspberries"), 1);
    });

    it("update modified ..., larger ... but w/ more unchanged child elements than existing (some need to be inserted as new)", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryPropsArr: DefinitionGroup[] = [];

      for (let i = 0; i < 4; i++) {
        const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
        blueberryProps.userLabel = `definitions of blueberries`;
        blueberryPropsArr.push(blueberryProps);
      }

      const poppedChild = berryTree.childElements!.pop ();

      berryTree.childElements!.unshift({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[0].toJSON(),
      });

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[1].toJSON(),
      });

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[2].toJSON(),
      });

      berryTree.childElements!.push(poppedChild!);

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryPropsArr[3].toJSON(),
      });

      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![1].elementProps.id = undefined;
      berryTree.childElements![2].itemState = ItemState.Unchanged;
      berryTree.childElements![2].elementProps.id = undefined;
      berryTree.childElements![3].itemState = ItemState.Unchanged;
      berryTree.childElements![3].elementProps.id = undefined;
      berryTree.childElements![4].itemState = ItemState.Unchanged;
      berryTree.childElements![4].elementProps.id = undefined;

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const query = (label: string) => `select count(*) from bis:DefinitionGroup where UserLabel = 'definitions of ${label}'`;

      count(query("blueberries"), 4);
      count(query("strawberries"), 1);
      count(query("raspberries"), 1);
    });
    it("update modified ..., larger ... but w/ one new child element but HAS id", () => {
      const synchronizer = new Synchronizer(imodel, false);
      const { model, berryTree, berryTreeMeta } = berryGroups(synchronizer);

      assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);

      const blueberryProps = DefinitionGroup.create (imodel, model.id!, Code.createEmpty(), false);
      blueberryProps.userLabel = "definitions of blueberries";

      berryTree.childElements!.push({
        itemState: ItemState.New,
        elementProps: blueberryProps.toJSON(),
      });

      berryTree.childElements![0].itemState = ItemState.Unchanged;
      berryTree.childElements![1].itemState = ItemState.Unchanged;
      berryTree.childElements![2].itemState = ItemState.New;
      berryTree.childElements![2].elementProps.id = "New elements should NOT have Ids!";

      // Patch berry definition group.
      berryTreeMeta.version = "1.0.1";
      try {
        assert.strictEqual(synchronizer.updateIModel(berryTree, berryTreeMeta), IModelStatus.Success);
      } catch (e: any) {
        assert.strictEqual(e.errorNumber, IModelStatus.InvalidId);
        return;
      }
      assert (false, `${berryTree.childElements![2].elementProps.id} - should have thrown an error`);
    });
  });
});
