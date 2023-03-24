# Change Log - @itwin/connector-framework

## 1.1.1

- Fixes bug in issue reporter to generate correct reports
- Rethrows errors caught in `ConnectorRunner`

## 1.1.0

- Breaking change: renames job subject to keep backwards compatibility with the 2.X framework. Can be reverted in the connector by overwriting `getJobSubjectName` to return only `sourcePath`
- Reverts job subject properties to use Bridge instead of Connector. Keeps persisted data backwards compatible

## 1.0.3

- Upgrades iTwin dependencies to 3.5.0
- Replaces deprectaed `ExternalSourceAspect.findBySource` with `ExternalSourceAspect.findAllBySource`

## 1.0.2

- Adds the ability to unmap as an overwritable function
- Initializes issue reporter to the SQLite issue reporter
- Removes `ElementTreeWalker.ts` and uses the implementation in `iTwin/core-backend`
- Adds an example wrapper `ExampleWrapper.ts`
- Adds documentation tags for easier code extraction

## 1.0.1

- Renames `moreArgs` to `connectorArgs` and allows this parameter to be accessed by the connector

## 1.0.0

- Removes `doDetectDeletedElements` from job args. Deletion is toggled by overriding the `BaseConnector` function `shouldDeleteElements`

## 0.2.0

- Add code coverage tooling with nyc and mocha
- Updates to locking to better implement pattern used in iTwinjs
- Changes to default behavior of deletion as well as a new opt-in deletion procedure using the ElementSubTreeDeleter
- Major changes to synchronizer.ts
- Changes to method signatures Synchronizer.recordDocument, Synchronizer.detectChanges, and Synchronizer.updateIModel to consolidate the 'kind' and 'scope' parameters into the SourceItem object (Breaking API Change)

## 0.1.0

- Initial release of the iTwin Connector Framework