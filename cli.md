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
abstract class CliArgs {

  // JobArgs

  connectorFile: string,                                      // absolute path
  sourceFile: string,                                         // absolute path
  subjectName: string,
  revisionHeader: string = "jsfwk",
  useSnapshot: boolean = false,
  env: "0" | "102" | "103",                                   // prod | qa | dev

  briefcaseFile?: string,                                     // absolute path to an existing briefcase file
  briefcaseId?: number,                                       // downloads a new Briefcase if undefined

  badgersDbFile: string = path.join(__dirname, "badgers.db")  // absolute path
  loggerConfigJSONFile?: string,                              // absolute path

  outputDir: string = path.join(__dirname, "output"),         // absolute path
  assetsDir: string = path.join(__dirname, "assets"),         // absolute path

  unmapInputFile?: string,                                    // absolute path
  unmapMissingInputFile?: string,                             // absolute path

  remapStart: boolean = false,
  remapKeep: boolean = false,
  remapComplete: boolean = false,

  allDocsProcessed: boolean = false,

  syncComplete: boolean = false,
  syncConfigFile?: string,                                    // absolute path

  updateDomainSchemas: boolean = true,
  updateDbProfile: boolean = true,
  doDetectDeletedElements: boolean = true,

  enableCrashReporting: boolean = false,
  changeFileIdPolicy: boolean = false,

  dmsUsername?: string,
  dmsPassword?: string,
  dmsInputFileUrn?: string,
  dmsAccessToken?": string,

  moreArgs?: { [otherArg: string]: any }

  // HubArgs

  hubIModelGuid?: string,
  hubContextGuid?: string,
  hubAccessToken?: string,

  // BankArgs

  bankAccessToken?: string,
  bankAccessTokenScheme?: string,
  bankContextGuid?: string,
  bankDmsCredentialsIsEncrypted?: string,
  bankIModelGuid?: string,
  bankIModelName?: string,
  bankMaxRetryWait?: number,
  bankRetries?: number,
  bankStorageType?: string,
  bankUrl?: string,

  // PCFArgs

  pcfSubjectNode?: string,
  pcfLoaderNode?: string,
  pcfLoaderLazyMode?: boolean,

  // NativeAppAuthorizationConfiguration (https://www.itwinjs.org/reference/imodeljs-common/nativeapp/nativeappauthorizationconfiguration)
  // we need to enable this to enforce third-parties to use their own registered client app

  appClientId: string,
  appClientScope: string,
  appClientRedirectUri: string = "http://localhost:3000/call-back",
  appExpiryBuffer?: number,
  appIssuerUrl?: string,
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
