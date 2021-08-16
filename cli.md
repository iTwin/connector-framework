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

# JS args candidates


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
