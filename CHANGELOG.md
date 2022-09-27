# Change Log - @itwin/connector-framework

## 0.1.0

- Initial release of the iTwin Connector Framework

## 0.2.0

- Add code coverage tooling with nyc and mocha
- Updates to locking to better implement pattern used in iTwinjs
- Changes to default behavior of deletion as well as a new opt-in deletion procedure using the ElementSubTreeDeleter
- Major changes to synchronizer.ts
- Changes to method signatures Synchronizer.recordDocument, Synchronizer.detectChanges, and Synchronizer.updateIModel to consolidate the 'kind' and 'scope' parameters into the SourceItem object (Breaking API Change)

## 1.0.0

- Removes `doDetectDeletedElements` from job args. Deletion is toggled by overriding the `BaseConnector` function `shouldDeleteElements`