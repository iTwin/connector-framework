/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Framework
 */

import type { BriefcaseDb, ECSqlStatement, Element, IModelDb} from "@itwin/core-backend";
import { ElementUniqueAspect} from "@itwin/core-backend";
import { DefinitionElement, ElementOwnsChildElements, ExternalSource, ExternalSourceAspect, RepositoryLink } from "@itwin/core-backend";
import type { AccessToken, GuidString, Id64String} from "@itwin/core-bentley";
import { assert, DbResult, Guid, Id64, IModelStatus, Logger } from "@itwin/core-bentley";
import type { ElementProps, ExternalSourceAspectProps, ExternalSourceProps, RepositoryLinkProps } from "@itwin/core-common";
import { Code, IModel, IModelError, RelatedElement } from "@itwin/core-common";
import { LoggerCategories } from "./LoggerCategory";

/** The state of the given SourceItem against the iModelDb
 * @beta
 */
export enum ItemState {
  /** The SourceItem is unchanged */
  Unchanged,
  /** The SourceItem is not currently in the iModelDb */
  New,
  /** The SourceItem has been changed */
  Changed,
}

/** @beta */
export interface ChangeResults {
  /** Id of the item, if it currently exists in the iModel */
  id?: Id64String;
  /** State of the item */
  state: ItemState;
}

/** Interface for presenting an item in the source repository
 * @beta
 */
export interface SourceItem {
  /** Unique Identity of the source item (relative to its scope and kind). */
  id: string;
  /** An optional value that is typically a version number or a pseudo version number like last modified time.
   * It will be used by the synchronization process to detect that a source object is unchanged so that computing a cryptographic hash can be avoided.
   * If present, this value must be guaranteed to change when any of the source object's content changes. If not defined, checksum must be defined
   */
  version?: string;
  /** The optional cryptographic hash (any algorithm) of the source object's content. If defined, it must be guaranteed to change when the source object's content changes.
   * The definition and method of computing this value is known only to the source repository.  If not defined, version must be defined.
   */
  checksum?: string;
}

/** Properties that may be assigned to a document by its home document control system
 * @beta
 */
export interface DocumentProperties {
  /** The GUID assigned to the document */
  docGuid?: string;
  /** The URN to use when referring to this document over the Internet */
  webURN?: string;
  /** The URN to use when referring to this document from a desktop program */
  desktopURN?: string;
  /** Document attributes, in JSON format */
  attributesJson?: string;
  /** Spatial data transform for root document, in JSON format */
  spatialRootTransformJson?: string;
  /** Change history information, in Json format */
  changeHistoryJson?: string;
}

/** @beta */
export interface SynchronizationResults {
  /** The props of the element being synchronized */
  elementProps: ElementProps;
  /**  Children of element that have been synchronized */
  childElements?: SynchronizationResults[];
  /** The state of the element */
  itemState: ItemState;
}

/** Helper class for interacting with the iModelDb during synchronization.
 * @beta
 */
export class Synchronizer {
  private _seenElements: Set<Id64String> = new Set<Id64String>();
  private _seenAspects: Set<Id64String> = new Set<Id64String>();
  private _unchangedSources: Id64String[] = new Array<Id64String>();
  private _links = new Map<string, SynchronizationResults>();

  public constructor(public readonly imodel: IModelDb, private _supportsMultipleFilesPerChannel: boolean, protected _requestContext?: AccessToken) {
    if (imodel.isBriefcaseDb() && undefined === _requestContext)
      throw new IModelError(IModelStatus.BadArg, "RequestContext must be set when working with a BriefcaseDb");
  }

  /** Insert or update a RepositoryLink element to represent the source document.  Also inserts or updates an ExternalSourceAspect for provenance.
   * @param scope The scope of the RepositoryLink's ExternalSourceAspect
   * @param sourceItem Identifies the document. The item's version property should the last modified time of the document. The checksum property is optional. It may be a cryptographic hash of the file's contents, or some other metric that is guaranteed to change when the document changes.
   * @param kind Optional. The document kind. Defaults to "DocumentWithBeGuid"
   * @param knownUrn Optional. The URN of the master document. Defaults to "".
   * @throws [[IModelError]] if a RepositoryLink for this document already exists, but there is no matching ExternalSourceAspect.
   */
  public recordDocument(scope: Id64String, sourceItem: SourceItem, kind: string = "DocumentWithBeGuid", knownUrn: string = ""): SynchronizationResults {
    const key = scope + sourceItem.id.toLowerCase();
    const existing = this._links.get(key);
    if (existing !== undefined) {
      return existing;
    }

    if (undefined === knownUrn) {
      // C++ calls GetParams().QueryDocumentURN()
    }
    const repositoryLink = this.makeRepositoryLink(sourceItem.id, "", knownUrn);

    if (undefined === repositoryLink) {
      throw new IModelError(IModelStatus.BadElement, `Failed to create repositoryLink for ${knownUrn}`);
    }

    const results: SynchronizationResults = {
      elementProps: repositoryLink.toJSON(),
      itemState: ItemState.New,
    };

    const itemState = this.detectChanges(scope, kind, sourceItem).state;
    if (Id64.isValidId64(repositoryLink.id) && itemState === ItemState.New) {
      const error = `A RepositoryLink element with code=${repositoryLink.code} and id=${repositoryLink.id} already exists in the bim file.
      However, no ExternalSourceAspect with scope=${scope} and kind=${kind} was found for this element.
      Maybe RecordDocument was previously called on this file with a different scope or kind.`;
      throw new IModelError(IModelStatus.NotFound, error);
    }

    results.itemState = itemState;
    const status = this.updateIModel(results, scope, sourceItem, kind);

    if (results.elementProps.id === undefined)
      throw new IModelError(status, `Failed to insert repositoryLink ${JSON.stringify(results.elementProps)}`);

    const xseProps: ExternalSourceProps = {
      model: scope,
      classFullName: ExternalSource.classFullName,
      repository: { id: results.elementProps.id, relClassName: RepositoryLink.classFullName },
      code: Code.createEmpty(),
    };

    if (this.getExternalSourceElement(repositoryLink) === undefined)
      this.imodel.elements.insertElement(xseProps);

    this._links.set(key, results);

    return results;
  }

  /** Detect if the item has changed or is new.
   * @param scope The scoping item
   * @param kind the kind of source item
   * @param item the source item
   * @returns the results of looking in the iModelDb and comparing the existing source record, if any, with the item's current state.
   * @beta
   */
  public detectChanges(scope: Id64String, sourceKind: string, item: SourceItem): ChangeResults {
    let ids: any;
    const results: ChangeResults = {
      state: ItemState.New,
    };
    if (item.id !== "")
      ids = ExternalSourceAspect.findBySource(this.imodel, scope, sourceKind, item.id);
    if (ids.aspectId === undefined) {
      return results;
    }

    let aspect: ExternalSourceAspect | undefined;

    try {
      aspect = this.imodel.elements.getAspect(ids.aspectId) as ExternalSourceAspect;
    } catch (err) {
      if (!(err instanceof IModelError) || (err.errorNumber !== IModelStatus.NotFound)) // unfortunately, the only way we can find out if an aspect is NOT there is by getting an error when asking for it.
        throw err;
      return results;
    }
    if (undefined === aspect)
      return results;
    this._seenAspects.add(aspect.id);
    if (undefined !== aspect.version && undefined !== item.version && aspect.version !== item.version) {
      results.state = ItemState.Changed;
      results.id = ids.elementId;
      return results;
    }
    if (undefined !== aspect.checksum && undefined !== item.checksum && aspect.checksum !== item.checksum) {
      results.state = ItemState.Changed;
      results.id = ids.elementId;
      return results;
    }
    results.id = ids.elementId;
    results.state = ItemState.Unchanged;
    if ("DocumentWithBeGuid" === sourceKind) {
      this._unchangedSources.push(ids.elementId);
    }
    return results;
  }

  /** Update the BIM with the results of converting an item to one or more DgnElements.
   * If the item is new or changed, the conversion writes are written to the BIM and the associated ExternalSourceAspect is updated.
   * If the item is known and unchanged, then the BIM is not updated.
   * In either case, this function will record the id of the element as having been seen.
   * @param element The DgnElement to be inserted or updated
   * @param itemState Whether the element is new, changed, or unchanged
   * @param scope Id of the scoping element
   * @param sourceItem Defines the source item
   * @param kind The kind of the source item
   * @param externalSourceElement External source pointing to the Repository Link. Use getExternalSourceElement for this parameter
   * @beta
   */
  public updateIModel(results: SynchronizationResults, scope: Id64String, sourceItem: SourceItem, kind: string, externalSourceElement?: ExternalSourceProps): IModelStatus {
    let status: IModelStatus = IModelStatus.Success;
    if (ItemState.Unchanged === results.itemState) {
      if (results.elementProps.id === undefined || !Id64.isValidId64(results.elementProps.id))
        throw new IModelError(IModelStatus.BadArg, "missing id");

      this.onElementSeen(results.elementProps.id);
      return status;
    }

    let aspectId: Id64String | undefined;
    if (sourceItem.id !== "") {
      const xsa = ExternalSourceAspect.findBySource(this.imodel, scope, kind, sourceItem.id);
      if (xsa.aspectId !== undefined) {
        aspectId = xsa.aspectId;
      }
    }

    // WIP: Handle the case where we are doing a delete + insert and are re-using the old element's id
    // let forceInsert: boolean = false;
    // if (undefined !== eid) {
    //   if (this._iModelDb.elements.tryGetElement(eid) === undefined) {
    //     forceInsert = true;
    //   }
    // }

    if (undefined !== aspectId) {
      if (IModelStatus.Success !== (status = this.updateResultsInIModel(results))) {
        return status;
      }
    } else {
      if (IModelStatus.Success !== (status = this.insertResultsIntoIModel(results))) {
        return status;
      }
    }

    assert(results.elementProps.id !== undefined && Id64.isValidId64(results.elementProps.id));

    let sourceId;
    if (externalSourceElement && externalSourceElement.id)
      sourceId = externalSourceElement.id;

    status = this.setExternalSourceAspect(results.elementProps, results.itemState, scope, sourceItem, kind, sourceId);
    return status;
  }

  /** Adds or updates the external source aspect for the given source item onto the related element
   * @param element The element to attach the ExternalSourceAspect
   * @param itemState The state of the source item
   * @param scope The id of the scoping element
   * @param sourceItem Defines the source item
   * @param kind The kind of the source item
   * @param source The id of the external source element
   * @beta
   */
  public setExternalSourceAspect(element: ElementProps, itemState: ItemState, scope: Id64String, sourceItem: SourceItem, kind: string, sourceId?: Id64String): IModelStatus {
    assert(element.id !== undefined && Id64.isValidId64(element.id));
    const source = sourceId ? { id: sourceId } : undefined;
    const aspectProps: ExternalSourceAspectProps = {
      classFullName: ExternalSourceAspect.classFullName,
      element: { id: element.id },
      scope: { id: scope },
      identifier: sourceItem.id,
      kind,
      checksum: sourceItem.checksum,
      version: sourceItem.version,
      source,
    };
    if (itemState === ItemState.New) {
      this.imodel.elements.insertAspect(aspectProps); // throws on error
    } else {
      this.imodel.elements.updateAspect(aspectProps);
    }
    return IModelStatus.Success;
  }

  /** Returns the External Source Element associated with a repository link
   * @param repositoryLink The repository link associated with the External Source Element
   * @beta
   */
  public getExternalSourceElement(repositoryLink: Element): ExternalSourceProps | undefined {
    return this.getExternalSourceElementByLinkId(repositoryLink.id);
  }

  /** Returns the External Source Element associated with a repository link
   * @param repositoryLinkId The ElementId of the repository link associated with the External Source Element
   * @beta
   */
  public getExternalSourceElementByLinkId(repositoryLinkId: Id64String): ExternalSourceProps | undefined {
    let sourceId;
    this.imodel.withStatement(
      "select * from BisCore.ExternalSource where repository.id=?",
      (stmt) => {
        stmt.bindValues([repositoryLinkId]);
        stmt.step();
        const row = stmt.getRow();
        sourceId = row.id;
      }
    );
    if(sourceId)
      return this.imodel.elements.getElementProps<ExternalSourceProps>(sourceId);
    return;
  }

  /** Given synchronizations results for an element (and possibly its children), insert the new element into the bim
   * @param results The result set to insert
   * @beta
   */
  public insertResultsIntoIModel(results: SynchronizationResults): IModelStatus {
    const elementProps = results.elementProps;
    const elid = this.imodel.elements.insertElement(elementProps); // throws on error

    results.elementProps.id = elid;

    this.onElementSeen(elid);
    if (undefined === results.childElements) {
      return IModelStatus.Success;
    }

    for (const child of results.childElements) {
      const parent = new RelatedElement({ id: elid, relClassName: ElementOwnsChildElements.classFullName });
      child.elementProps.parent = parent;
      const status = this.insertResultsIntoIModel(child);
      if (status !== IModelStatus.Success) {
        return status;
      }
    }
    return IModelStatus.Success;
  }

  /** Given synchronizations results for an element (and possibly its children), updates element in the bim
   * @param results The result set to insert
   * @beta
   */
  public updateResultsInIModel(results: SynchronizationResults): IModelStatus {
    const status = this.updateResultInIModelForOneElement(results);
    if (IModelStatus.Success !== status) {
      return status;
    }
    return this.updateResultsInIModelForChildren(results);
  }

  /** Records that this particular element was visited during this synchronization. This information will later be used to determine which
   * previously existing elements no longer exist and should be deleted.
   * @beta
   */
  public onElementSeen(id: Id64String) {
    this._seenElements.add(id);
  }

  /** Deletes elements from a BriefcaseDb that were previously converted but not longer exist in the source data.
   * @beta
   */
  public detectDeletedElements() {
    if (this.imodel.isSnapshotDb())
      return;

    if (this._supportsMultipleFilesPerChannel)
      this.detectDeletedElementsInFiles();
    else
      this.detectDeletedElementsInChannel();
  }

  private detectDeletedElementsInChannel() {
    // This detection only is called for connectors that support a single source file per channel. If we skipped that file because it was unchanged, then we don't need to delete anything
    if (this._unchangedSources.length !== 0)
      return;
    const sql = `SELECT aspect.Element.Id FROM ${ExternalSourceAspect.classFullName} aspect WHERE aspect.Kind !='DocumentWithBeGuid'`;
    const elementsToDelete: Id64String[] = [];
    const defElementsToDelete: Id64String[] = [];
    const db = this.imodel as BriefcaseDb;
    this.imodel.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const elementId = statement.getValue(0).getId();
        // const elementChannelRoot = db.elements.channel.getChannelOfElement(db.elements.getElement(elementId)); // not sure how to retrieve the channel of an element with these changes, need to ask monday
        // const isInChannelRoot = elementChannelRoot.channelRoot === db.concurrencyControl.channel.channelRoot;
        const hasSeenElement = this._seenElements.has(elementId);
        if (!hasSeenElement) {
          const element = db.elements.getElement(elementId);
          if (element instanceof DefinitionElement)
            defElementsToDelete.push(elementId);
          else
            elementsToDelete.push(elementId);
        }
      }
    });
    this.deleteElements(elementsToDelete, defElementsToDelete);
  }

  private detectDeletedElementsInFiles() {
    for (const value of this._links.values()) {
      if (value.itemState === ItemState.Unchanged || value.itemState === ItemState.New)
        continue;
      assert(value.elementProps.id !== undefined && Id64.isValidId64(value.elementProps.id));
      this.detectDeletedElementsInScope(value.elementProps.id);
    }
  }

  private detectDeletedElementsInScope(scopeId: Id64String) {
    const sql = `SELECT aspect.Element.Id FROM ${ExternalSourceAspect.classFullName} aspect WHERE aspect.Scope.Id=?`;
    const elementsToDelete: Id64String[] = [];
    const defElementsToDelete: Id64String[] = [];
    this.imodel.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindId(1, scopeId);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const elementId = statement.getValue(0).getId();
        const element = this.imodel.elements.getElement(elementId);
        const hasSeenElement = this._seenElements.has(elementId);
        if (!hasSeenElement) {
          if (element instanceof DefinitionElement)
            defElementsToDelete.push(elementId);
          else
            elementsToDelete.push(elementId);
        }
        this.detectDeletedElementsInScope(elementId);
      }
    });
    this.deleteElements(elementsToDelete, defElementsToDelete);
  }

  private deleteElements(elementIds: Id64String[], defElementIds: Id64String[]) {
    for (const elementId of elementIds) {
      if (this.imodel.elements.tryGetElement(elementId)){
        this.imodel.elements.deleteElement(elementIds);
        const aspects = this.imodel.elements.getAspects(elementId, ElementUniqueAspect.classFullName);
        for ( const aspect of aspects){
          if(this._seenAspects.has(aspect.id))
            continue;
          this.imodel.elements.deleteAspect(aspect.id);
        }
      }
    }
    for (const elementId of defElementIds) {
      if (this.imodel.elements.tryGetElement(elementId))
        this.imodel.elements.deleteDefinitionElements(defElementIds);
    }
  }

  private updateResultInIModelForOneElement(results: SynchronizationResults): IModelStatus {
    assert(results.elementProps !== undefined, "don't call this function if you don't have a persistent element");
    const elementProps = results.elementProps;
    if (elementProps.id === undefined || !Id64.isValidId64(elementProps.id))
      throw new IModelError(IModelStatus.BadArg, "don't call this function if you don't have a persistent element");
    this.onElementSeen(elementProps.id);
    const existing = this.imodel.elements.tryGetElement(elementProps.id);
    if (undefined === existing) {
      return IModelStatus.BadArg;
    }
    if (existing.classFullName !== elementProps.classFullName) {
      const error = `Attempt to change element's class in an update operation. Do delete + add instead. ElementId ${elementProps.id},
      old class=${existing.classFullName}, new class=${elementProps.classFullName}`;
      Logger.logError(LoggerCategories.Framework, error);
      return IModelStatus.WrongClass;
    }
    this.imodel.elements.updateElement(elementProps);

    assert(elementProps.id !== undefined && Id64.isValidId64(elementProps.id));

    return IModelStatus.Success;
  }

  private updateResultsInIModelForChildren(results: SynchronizationResults): IModelStatus {
    if (undefined === results.childElements || results.childElements.length < 1) {
      return IModelStatus.Success;
    }
    if (results.elementProps.id === undefined || !Id64.isValidId64(results.elementProps.id)) {
      const error = `Parent element id is invalid.  Unable to update the children.`;
      Logger.logError(LoggerCategories.Framework, error);
      return IModelStatus.BadArg;
    }
    results.childElements.forEach((child) => {
      const parent = new RelatedElement({ id: results.elementProps.id!, relClassName: ElementOwnsChildElements.classFullName });
      child.elementProps.parent = parent;
    });

    const existingChildren = this.imodel.elements.queryChildren(results.elementProps.id);
    // While we could just delete all existing children and insert all new ones, we try to do better.
    // If we can figure out how the new children map to existing children, we can update them.

    // Note that in the update logic below we don't delete existing children that were not mapped.
    // Instead, we just refrain from calling the change detector's _OnElementSeen method on unmatched child elements.
    // That will allow the updater in its final phase to infer that they should be deleted.

    // The best way is if an extension sets up the DgnElementId of the child elements in parentConversionResults.
    if (undefined !== results.childElements[0].elementProps && results.childElements[0].elementProps.id !== undefined && Id64.isValidId64(results.childElements[0].elementProps.id)) {
      for (const childRes of results.childElements) {
        if (undefined === childRes.elementProps) {
          continue;
        }
        const index = existingChildren.findIndex((c) => c === childRes.elementProps.id);
        if (-1 !== index) {
          const stat = this.updateResultsInIModel(childRes);
          if (stat !== IModelStatus.Success) {
            return stat;
          }
        }
      }
      return IModelStatus.Success;
    }

    // If we have to guess, we just try to match them up 1:1 in sequence.
    const count = Math.min(existingChildren.length, results.childElements.length);
    let i = 0;
    for (; i < count; i++) {
      this.updateResultsInIModel(results.childElements[i]);
    }
    for (; i < results.childElements.length; i++) {
      this.insertResultsIntoIModel(results.childElements[i]);
    }
    return IModelStatus.Success;
  }

  private makeRepositoryLink(document: string, defaultCode: string, defaultURN: string, preferDefaultCode: boolean = false): Element {
    const [docProps, code] = this.getRepositoryLinkInfo(document, defaultCode, defaultURN, preferDefaultCode);
    let repositoryLink = this.imodel.elements.tryGetElement(code) as RepositoryLink;
    if (undefined === repositoryLink) {
      const elementProps: RepositoryLinkProps = {
        classFullName: RepositoryLink.classFullName,
        model: IModel.repositoryModelId,
        code,
        url: docProps.desktopURN,
        userLabel: document,
        repositoryGuid: docProps.docGuid,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        jsonProperties: { DocumentProperties: { desktopURN: docProps.desktopURN, webURN: docProps.webURN, attributes: docProps.attributesJson } },
      };
      repositoryLink = this.imodel.elements.createElement(elementProps);
    }
    return repositoryLink;
  }

  private getRepositoryLinkInfo(document: string, defaultCode: string, defaultURN: string, preferDefaultCode: boolean): [DocumentProperties, Code] {
    const docProps: DocumentProperties = {};
    // If we have a documentPropertyAccessor, call it here

    if (docProps.desktopURN === undefined) {
      docProps.desktopURN = defaultURN;
    }

    if (docProps.docGuid === undefined) {
      const guid = this.parseDocGuidFromPwUri(docProps.desktopURN);
      if (Guid.isV4Guid(guid)) {
        docProps.docGuid = guid;
      }
    }

    let firstChoice: string | undefined;
    let secondChoice: string | undefined;
    if (preferDefaultCode) {
      firstChoice = defaultCode;
      secondChoice = docProps.docGuid;
    } else {
      firstChoice = docProps.docGuid;
      secondChoice = defaultCode;
    }

    let codeStr = firstChoice;
    if (undefined === codeStr || "" === codeStr) {
      if (undefined === (codeStr = secondChoice) || "" === codeStr) {
        if (undefined === (codeStr = docProps.desktopURN) || "" === codeStr) {
          codeStr = document;
        }
      }
    }
    if (undefined === docProps.desktopURN || "" === docProps.desktopURN) {
      docProps.desktopURN = document;
    }
    const code = RepositoryLink.createCode(this.imodel, IModel.repositoryModelId, codeStr);
    return [docProps, code];
  }

  private parseDocGuidFromPwUri(pwUri: string): GuidString {
    const guid: GuidString = Guid.empty;
    if (!pwUri.startsWith("pw://")) {
      return guid;
    }

    let startDguid = pwUri.indexOf("/D{");
    if (-1 === startDguid) {
      startDguid = pwUri.indexOf("/d{");
    }

    if (-1 === startDguid)
      return guid;
    const endDguid = pwUri.indexOf("}", startDguid);
    if (-1 === endDguid)
      return guid;

    const startGuid = startDguid + 3;
    const guidStr = pwUri.substring(startGuid, endDguid);
    if (Guid.isV4Guid(guidStr)) {
      return guidStr;
    }
    return guid;
  }
}
