# High-level concepts

- connector entry point (e.g. the script file containing the Connector)
- input (e.g. file or connection string -- can we just embed auth within connection string?)
- output (remote IDs, URLs, auth for Hub / Bank, or local snapshot path)
- staging directory (e.g. where to generate files)
- briefcase path (we want orchestrator to manage briefcases)
- user-issues path (orchestrator should manage the BADGERS sqlite DB)
- logging config path
- sync job config data path (provided by orchestrator)
- sync job context info (metadata for logging / crash reports)
- crash reporting opt-in
- unmap & remap support
- file policy ID change support
- phase support (e.g. all-docs-processed, sync-complete)

# Grey areas
- stale file handling
- DMS input handling (will instant on handle this for us in time?)

# Potential js args

Args in JSON (annotated definitions in .ts):

```typescript
/*

"///" = not supported and won't be added for now but most likely will be in the near future.

Classes - JobArgs, Flags, DMSArgs, HubArgs, BankArgs, will be instantiated from CliArgs in raw JSON format.

*/

abstract class CliArgs {

  // JobArgs

  connectorFile: string,                                              // absolute path
  source: string,                                                     // absolute path OR connection string
  subjectName?: string,
  revisionHeader: string = "jsfwk",                                   // effect: change set comment becomes "jsfwk - <actual comment>"
  env: "0" | "102" | "103" = "0",                                     // prod (default) | qa | dev 

  briefcaseFile: string,                                              // absolute path to a local Briefcase file downloaded by the orchestrator
  briefcaseId?: number,                                               // start from 2

  badgersDbFile: string = path.join(__dirname, "badgers.db")          // absolute path
  loggerConfigJSONFile?: string,                                      // absolute path

  /// outputDir: string = path.join(__dirname, "output"),                 // absolute path
  /// unmapInputFile?: string,                                            // absolute path
  /// unmapMissingInputFile?: string,                                     // absolute path
  /// syncConfigFile?: string,                                            // absolute path

  moreArgs?: { [otherArg: string]: any }                              // whatever (include PCF args here). How could the orchestrator pass this in?

  /// pcfSubjectNode?: string,
  /// pcfLoaderNode?: string,
  /// pcfLoaderLazyMode?: boolean,

  // Flags

  /// remapStart: boolean = false,
  /// remapKeep: boolean = false,
  /// remapComplete: boolean = false,
  /// allDocsProcessed: boolean = false,
  /// syncComplete: boolean = false,

  /// updateDomainSchemas: boolean = true,
  /// updateDbProfile: boolean = true,
  /// doDetectDeletedElements: boolean = true,

  /// enableCrashReporting: boolean = false,
  /// changeFileIdPolicy: boolean = false,

  // DMSArgs (could be used for any DMS like an API endpoint)

  /// dmsUsername?: string,
  /// dmsPassword?: string,
  /// dmsInputFileUrn?: string,
  /// dmsAccessToken?": string,

  // HubArgs

  hubIModelGuid?: string,
  hubContextGuid?: string,
  // passing a callback through .json is not possible, maybe a path to a file that stores the access token?
  accessToken?: string,

  // BankArgs

  /// bankAccessToken?: string,
  /// bankAccessTokenScheme?: string,
  /// bankContextGuid?: string,
  /// bankDmsCredentialsIsEncrypted?: string,
  /// bankIModelGuid?: string,
  /// bankIModelName?: string,
  /// bankMaxRetryWait?: number,
  /// bankRetries?: number,
  /// bankStorageType?: string,
  /// bankUrl?: string,
}


```


# All native args (reference)
```
--fwk-affinityMappingJsonFile
--fwk-all-docs-processed
--fwk-argsJson
--fwk-assetsDir
--fwk-bridge-library
--fwk-bridge-regsubkey
--fwk-bridgeAssetsDir
--fwk-change-file-policy
--fwk-docker-container-version
--fwk-enable-crash-reporting
--fwk-error-on-stale-files
--fwk-external-source-subset-graphs-db
--fwk-external-source-subset-id
--fwk-gpr-id
--fwk-ignore-stale-files
--fwk-input
--fwk-input
--fwk-input-sheet
--fwk-inputArgsJsonFile
--fwk-job-subject-name
--fwk-job-version
--fwk-jobrequest-guid
--fwk-jobrun-guid
--fwk-logging-config-file
--fwk-max-wait=milliseconds
--fwk-no-intermediate-pushes
--fwk-no-mergeDefinitions
--fwk-pool-id
--fwk-pool-status
--fwk-reality-data-dir
--fwk-remap-complete
--fwk-remap-keep={method
--fwk-remap-start
--fwk-revision-comment
--fwk-skip-assignment-check
--fwk-snapshot
--fwk-staging-dir
--fwk-status-message-interval
--fwk-status-message-sink-url
--fwk-synchronization-complete
--fwk-synchronization-config-json-file
--fwk-unmap-input-file
--fwk-unmap-missing-input-file
--dms-accessToken
--dms-additionalFiles
--dms-appWorkspace
--dms-datasource
--dms-documentGuid
--dms-documentId
--dms-folderId
--dms-inputFileUrn
--dms-library
--dms-password
--dms-retries
--dms-type
--dms-user
--dms-workspaceDir
--dms-workspaceDir
--dms-wsgFileBatchSize
--imodel-bank-access-token
--imodel-bank-access-token-scheme
--imodel-bank-context-id
--imodel-bank-dms-credentials-isEncrypted
--imodel-bank-imodel-id
--imodel-bank-imodel-name
--imodel-bank-max-retry-wait
--imodel-bank-retries
--imodel-bank-storage-type
--imodel-bank-url
--server-accessToken
--server-briefcaseId
--server-clientId
--server-clientScope
--server-clientSecret
--server-credentials-isEncrypted
--server-max-retry-wait
--server-oidcCallBackUrl
--server-password
--server-project
--server-project-guid
--server-repository
--server-repository-guid
--server-retries
--server-user
```