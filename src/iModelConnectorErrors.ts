/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See COPYRIGHT.md in the repository root for full copyright notice.
*--------------------------------------------------------------------------------------------*/

/*------------------------------------------------------------------------------
*  <auto-generated>
*     This code was generated from a template.
*
*     Manual changes to this file may cause unexpected behavior in your application.
*     Manual changes to this file will be overwritten if the code is regenerated.
*  </auto-generated>
*-----------------------------------------------------------------------------*/
export namespace SyncErrors{
  export interface Error{
    key: string;
    description: string;
    category: string;
    kbArticleLink: string;
    canUserFix: boolean;
  };
  export enum System {
    CloudOrchestrator = "cloud_orchestrator",
    EdgeOrchestrator = "edge_orchestrator",
    Connector = "connector",
  };
  export enum Category {
    Network = "network",
    ImsTokenAccess = "ims_token_access",
    ImodelAccess = "imodel_access",
    FileAccess = "file_access",
    DataConflict = "data_conflict",
    Configuration = "configuration",
    Other = "other",
  };
  export enum CloudOrchestratorPhases {
    Initialization = "initialization",
    Preprocessor = "preprocessor",
    FileDownload = "file_download",
    FileCaching = "file_caching",
    Affinity = "affinity",
    Planning = "planning",
    Master = "master",
    Reference = "reference",
    Postprocessing = "postprocessing",
    ExternalToRunExecution = "external_to_run_execution",
    InternalServerError = "internal_server_error",
    ConnectorInitialization = "connector_initialization",
  };
  export enum EdgeOrchestratorPhases {
  };
  export enum ConnectorPhases {
    AcquireBriefcase = "acquire_briefcase",
    FetchFromDms = "fetch_from_dms",
    Initialization = "initialization",
    Schema = "schema",
    DefinitionElements = "definition_elements",
    FileFormat = "file_format",
    SpatialElements = "spatial_elements",
    SheetElements = "sheet_elements",
    Finalization = "finalization",
    InternalServerError = "internal_server_error",
    PullMergePush = "pull_merge_push",
    WorkspaceCheck = "workspace_check",
    AffinityCheck = "affinity_check",
    Unmap = "unmap",
    UserPermission = "user_permission",
  };
  export enum KbArticleLink {
    AccessToDataSourceDenied = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098347",
    AllFilesHaveFailed = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098417",
    AnotherUserPushing = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098412",
    ConnectorLockError = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098388",
    DatasourceAuthenticationTypeIsNotSupported = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098405",
    DocumentNotFound = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098413",
    DrawingFileWithWrongConfig = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098392",
    DuplicateData = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#DuplicateModels",
    DwgMissingGeometry = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098314#Dwg_0103",
    FailedToAccessDataSource = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098389",
    FailedToConnectToRemoteServerApplication = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098451",
    FailedToRetryTask = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098415",
    FileFormat = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098410",
    GeodeticCoordinateSystemNotSupported = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098404",
    IModelAccessForbidden = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098408",
    IModelNotFound = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098390",
    IncompleteDxfHeader = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#IncompleteDxfFile",
    InconsistentURL = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098383",
    ITwinSpatialAlignment = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098345",
    MissingShapefileDbfShx = "https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0098348#convertingShapeFiles",
    MissingWorkspace = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#MissingWorkspace",
    NonLinearUnits = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#NonLinearUnits",
    NotEnoughRightsInCONNECTEDContext = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ProjectSharePermissionMissing",
    ProductInstallationPathNotFound = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ProductInstallationPathNotFound",
    ProtectedFile = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098414",
    RootNotSpatial = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#RootNotSpatial",
    SchemaUpgradeFailure = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098400",
    SourceFileCorrupted = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#SourceFileCorrupted",
    SourceFileIsForbidden = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098397",
    SourceFileNotAccessible = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098399",
    SourceFileNotFound = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098398",
    UnmapInputFile = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098403",
    UserLacksPssPermissions = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ProductSettingPermissionsMissing",
    UserNotAuthenticated = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098401",
    WorksetOverrideNotFound = "https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0098387",
    ZeroByte = "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ZeroByte",
  };
  export class Errors {
    public static briefcase_deleted: Error  = {key: "briefcase_deleted", description: "Briefcase ID %u does not exist on the server, so it cannot be restored. You must acquire a new briefcase.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static briefcase_deleted_only_remotely: Error  = {key: "briefcase_deleted_only_remotely", description: "Briefcase ID %u does not exist on the server, so the local briefcase cannot be re-used. You must acquire a new briefcase.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static OpenBriefcaseFailed: Error  = {key: "OpenBriefcaseFailed", description: "Failed to open Briefcase with id %u.  Please contact Bentley Support for more information. Error code: %d. Error message: %s", category: "other", kbArticleLink: "", canUserFix: false};
    public static AllJobsFailed: Error  = {key: "AllJobsFailed", description: "All processing Jobs of the Run failed.", category: "other", kbArticleLink: "", canUserFix: false};
    public static SomeJobsFailed: Error  = {key: "SomeJobsFailed", description: "Some Jobs of the Run were not successful.", category: "other", kbArticleLink: "", canUserFix: false};
    public static RunOrchestrationError: Error  = {key: "RunOrchestrationError", description: "Failed to orchestrate Run.", category: "other", kbArticleLink: "", canUserFix: false};
    public static UserNotAuthenticated: Error  = {key: "UserNotAuthenticated", description: "User is not authenticated.", category: "ims_token_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098401", canUserFix: true};
    public static UserAuthenticationFailed: Error  = {key: "UserAuthenticationFailed", description: "Failed to orchestrate Run.", category: "ims_token_access", kbArticleLink: "", canUserFix: false};
    public static PreprocessingFailed: Error  = {key: "PreprocessingFailed", description: "Preprocessing of the Run failed.", category: "other", kbArticleLink: "", canUserFix: false};
    public static AccessToDataSourceDenied: Error  = {key: "AccessToDataSourceDenied", description: "Access to the data source was denied.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098347", canUserFix: true};
    public static FailedToAccessDataSource: Error  = {key: "FailedToAccessDataSource", description: "Failed to access the data source.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098389", canUserFix: true};
    public static RunSchedulingConflict: Error  = {key: "RunSchedulingConflict", description: "Failed to execute Run due to a scheduling conflict.", category: "other", kbArticleLink: "", canUserFix: false};
    public static AffinityReportInvalid: Error  = {key: "AffinityReportInvalid", description: "Failed to read an affinity report.", category: "other", kbArticleLink: "", canUserFix: false};
    public static AffinityReportNotFound: Error  = {key: "AffinityReportNotFound", description: "Failed to orchestrate Run.", category: "file_access", kbArticleLink: "", canUserFix: false};
    public static ConnectorPoolNotFound: Error  = {key: "ConnectorPoolNotFound", description: "Failed to orchestrate Run.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static PreprocessorPoolNotFound: Error  = {key: "PreprocessorPoolNotFound", description: "Failed to orchestrate Run.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static IModelNotFound: Error  = {key: "IModelNotFound", description: "iModel was not found.", category: "imodel_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098390", canUserFix: true};
    public static IModelAccessForbidden: Error  = {key: "IModelAccessForbidden", description: "iModel access was forbidden.", category: "imodel_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098408", canUserFix: true};
    public static ExternalCommunicationError: Error  = {key: "ExternalCommunicationError", description: "Failed to orchestrate Run.", category: "network", kbArticleLink: "", canUserFix: false};
    public static AzureBatchRegionNotSupported: Error  = {key: "AzureBatchRegionNotSupported", description: "Failed to orchestrate Run.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static AzureStorageRegionNotSupported: Error  = {key: "AzureStorageRegionNotSupported", description: "Failed to orchestrate Run.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static FailedToAccessManifest: Error  = {key: "FailedToAccessManifest", description: "Failed to access the synchronization manifest.", category: "other", kbArticleLink: "", canUserFix: false};
    public static ManifestIsMalformed: Error  = {key: "ManifestIsMalformed", description: "Synchronization manifest is malformed.", category: "other", kbArticleLink: "", canUserFix: false};
    public static DocumentNotFound: Error  = {key: "DocumentNotFound", description: "File is deleted or not accessible.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098413", canUserFix: true};
    public static BridgeBatchPoolNotFound: Error  = {key: "BridgeBatchPoolNotFound", description: "Processing of this file type is not currently available.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static CloudJobNotFound: Error  = {key: "CloudJobNotFound", description: "Failed to orchestrate file processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static CloudJobFailed: Error  = {key: "CloudJobFailed", description: "Failed to orchestrate file processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static CloudTaskNotFound: Error  = {key: "CloudTaskNotFound", description: "Failed to orchestrate file processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static FailedToRetryTask: Error  = {key: "FailedToRetryTask", description: "Failed to orchestrate file processing retry.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098415", canUserFix: false};
    public static TaskWasCancelled: Error  = {key: "TaskWasCancelled", description: "File processing was canceled.", category: "other", kbArticleLink: "", canUserFix: false};
    public static BridgeWrapperFailed: Error  = {key: "BridgeWrapperFailed", description: "Failed to orchestrate file processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static BridgingFailed: Error  = {key: "BridgingFailed", description: "Failed to process the file.", category: "other", kbArticleLink: "", canUserFix: false};
    public static BridgingSucceededWithCriticalError: Error  = {key: "BridgingSucceededWithCriticalError", description: "Critical error(s) occurred during file processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static NodeBecameUnusable: Error  = {key: "NodeBecameUnusable", description: "Azure batch node was in an unusable state.", category: "other", kbArticleLink: "", canUserFix: false};
    public static foreign_format_too_old: Error  = {key: "foreign_format_too_old", description: "The input file format is unsupported because it is too old. Please upgrade the input file to a newer version.", category: "other", kbArticleLink: "", canUserFix: true};
    public static foreign_format_too_new: Error  = {key: "foreign_format_too_new", description: "The input file format is unsupported because it is too recent. Please downgrade the input file to an older version.", category: "other", kbArticleLink: "", canUserFix: true};
    public static launchdarkly_init_failed: Error  = {key: "launchdarkly_init_failed", description: "The connector is unable to reach launch darkly.", category: "network", kbArticleLink: "", canUserFix: false};
    public static legacyV8SchemaError: Error  = {key: "legacyV8SchemaError", description: "Failed to import legacy V8 schema.", category: "data_conflict", kbArticleLink: "", canUserFix: false};
    public static protectedFile: Error  = {key: "protectedFile", description: "Source file is protected and user does not have appropriate rights.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098414", canUserFix: true};
    public static rootModelNotSpatial: Error  = {key: "rootModelNotSpatial", description: "An attachment to a 3D model has been detected. However, the root model is not a 3D model.", category: "data_conflict", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#RootNotSpatial", canUserFix: true};
    public static MissingWorkspace: Error  = {key: "MissingWorkspace", description: "%s could not find the required workset %s for the %s file.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#MissingWorkspace", canUserFix: true};
    public static CanNotOpenFile: Error  = {key: "CanNotOpenFile", description: "%s: Cannot open the %s file; either the path is incorrect or the file is missing.", category: "other", kbArticleLink: "", canUserFix: true};
    public static UnsupportedFile: Error  = {key: "UnsupportedFile", description: "The input file format is unsupported. It is likely mapped to the wrong connector. If not, please try to reload the file from its original location.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098410", canUserFix: true};
    public static OutOfMemory: Error  = {key: "OutOfMemory", description: "Failed to process the file due to low memory condition. Please try to use more extended Azure pool.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static GeoLocationFailed: Error  = {key: "GeoLocationFailed", description: "The input file has an unsupported or incorrect geo-location.", category: "data_conflict", kbArticleLink: "", canUserFix: true};
    public static iModelHubError: Error  = {key: "iModelHubError", description: "Encountered an error while accessing iModelHub: %s", category: "imodel_access", kbArticleLink: "", canUserFix: false};
    public static Unhandled_exception: Error  = {key: "Unhandled_exception", description: "The connector encountered an exception in phase: %s", category: "other", kbArticleLink: "", canUserFix: false};
    public static JobAborted: Error  = {key: "JobAborted", description: "A connector job can no longer continue and has been aborted in phase %s [%s]", category: "other", kbArticleLink: "", canUserFix: false};
    public static DrawingFileWithWrongConfig: Error  = {key: "DrawingFileWithWrongConfig", description: "Do not use a 2D file as root model with sheets and drawings settings disabled.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098392", canUserFix: true};
    public static UnmapInputFile: Error  = {key: "UnmapInputFile", description: "The given input file does not have a master job subject and cannot be unmapped.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098403", canUserFix: true};
    public static UnmapInputFileUnknownError: Error  = {key: "UnmapInputFileUnknownError", description: "Unknown error unmapping a missing file.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098403", canUserFix: false};
    public static FailedToGenerateSchema: Error  = {key: "FailedToGenerateSchema", description: "%s: Could not generate DG EC3 schema.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static InconsistentURL: Error  = {key: "InconsistentURL", description: "%s: Reference URLS need to start with %s, do you need to run ProjectWise ScanRefs?", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098383", canUserFix: true};
    public static BimBridgeInitError: Error  = {key: "BimBridgeInitError", description: "%s: Server Configuration error, the Connector must be initialized using 'sync pre' keyin.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static BridgeJobError: Error  = {key: "BridgeJobError", description: "%s: Server Configuration error, the Connector Job can only be run once per session.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static BridgeJobAlreadyLoaded: Error  = {key: "BridgeJobAlreadyLoaded", description: "%s: the Connector Job could not be loaded or was loaded twice.", category: "other", kbArticleLink: "", canUserFix: false};
    public static AuthoringApplicationNotFound: Error  = {key: "AuthoringApplicationNotFound", description: "%s: Authoring application of active file not found.", category: "other", kbArticleLink: "", canUserFix: false};
    public static FileIDPolicyMismatch: Error  = {key: "FileIDPolicyMismatch", description: "File ID policy mismatch between iModel and Feature Flags.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static ProductInstallationPathNotFound: Error  = {key: "ProductInstallationPathNotFound", description: "Could not get path to %s product installation. Please check the product is installed correctly on the ProjetWise WSG machine.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ProductInstallationPathNotFound", canUserFix: true};
    public static ConnectionTimeout: Error  = {key: "ConnectionTimeout", description: "Connection timeout. Internet connection issue on server. Please contact your administrator and try again.", category: "network", kbArticleLink: "", canUserFix: false};
    public static AuthenticationTypeNotSupported: Error  = {key: "AuthenticationTypeNotSupported", description: "Datasource authentication type is not supported. IMS or federated login is required for the user to access ProjectWise datasource. Please enable IMS authentication for the ProjectWise datasource.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098405", canUserFix: true};
    public static UnexpectedError: Error  = {key: "UnexpectedError", description: "Unexpected error happened. Please contact your administrator.", category: "other", kbArticleLink: "", canUserFix: false};
    public static NotEnoughRightsInCONNECTEDContext: Error  = {key: "NotEnoughRightsInCONNECTEDContext", description: "User does not have 'Read' RBAC Permission. Please give relative permission to the user.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ProjectSharePermissionMissing", canUserFix: true};
    public static iModelDmsSupportError: Error  = {key: "iModelDmsSupportError", description: "Encountered an error while downloading files from repository: %s", category: "file_access", kbArticleLink: "", canUserFix: false};
    public static AzureBlobURLError: Error  = {key: "AzureBlobURLError", description: "The specified Azure Blob URL may have expired or not authorized to download. Please check and pass correct Azure Blob Url.", category: "file_access", kbArticleLink: "", canUserFix: true};
    public static FailedToFetchWorkspaceAndConfigFile: Error  = {key: "FailedToFetchWorkspaceAndConfigFile", description: "Failed to fetch workspace or generate workspace configuration file.", category: "configuration", kbArticleLink: "", canUserFix: true};
    public static ExportTokenFailed: Error  = {key: "ExportTokenFailed", description: "Failed to export token.", category: "other", kbArticleLink: "", canUserFix: false};
    public static AffinityReportDownloadFailed: Error  = {key: "AffinityReportDownloadFailed", description: "Failed to download affinity report.", category: "other", kbArticleLink: "", canUserFix: false};
    public static SourceFileDownloadFailed: Error  = {key: "SourceFileDownloadFailed", description: "Failed to download files from cache.", category: "other", kbArticleLink: "", canUserFix: false};
    public static ConnectorInitializationFailed: Error  = {key: "ConnectorInitializationFailed", description: "Error initializing connector.", category: "other", kbArticleLink: "", canUserFix: false};
    public static NetworkIssue: Error  = {key: "NetworkIssue", description: "There was a network issue, please try again later.", category: "other", kbArticleLink: "", canUserFix: false};
    public static BriefcaseCloseAndReopenFailed: Error  = {key: "BriefcaseCloseAndReopenFailed", description: "Failed to close and reopen root file or briefcase during processing. Unable to continue processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static UserLacksPssPermissions: Error  = {key: "UserLacksPssPermissions", description: "User does not have required Product Settings Service permissions.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#ProductSettingPermissionsMissing", canUserFix: true};
    public static LockError: Error  = {key: "LockError", description: "Connector was unable to acquire required locks: %s", category: "imodel_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098388", canUserFix: false};
    public static GeodeticGCSNotSupported: Error  = {key: "GeodeticGCSNotSupported", description: "The Geodetic coordinate systems is not supported.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098404", canUserFix: true};
    public static MissingShapefileDbfShx: Error  = {key: "MissingShapefileDbfShx", description: "Mandatory Shapefile .dbf or .shx files are missing.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0098348#convertingShapeFiles", canUserFix: true};
    public static CannotGetRepositoryLink: Error  = {key: "CannotGetRepositoryLink", description: "Encountered an internal inconsistency with model identification. Please contact support.", category: "other", kbArticleLink: "", canUserFix: false};
    public static WorksetOverrideNotFound: Error  = {key: "WorksetOverrideNotFound", description: "Workset override file not found.", category: "FileAccess", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0098387", canUserFix: true};
    public static SchemaUpgradeFailure: Error  = {key: "SchemaUpgradeFailure", description: "Connector failed to upgrade internal schemas.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098400", canUserFix: false};
    public static CannotOpenADxPIDSource: Error  = {key: "CannotOpenADxPIDSource", description: "Cannot open source %s. The file may be missing, corrupt, locked, or you may not have Visio installed.", category: "other", kbArticleLink: "", canUserFix: true};
    public static CannotOpenSPPIDSource: Error  = {key: "CannotOpenSPPIDSource", description: "Cannot open source %s. The file may be missing, corrupt, or unsupported.", category: "other", kbArticleLink: "", canUserFix: true};
    public static IncorrectConfigVariable: Error  = {key: "IncorrectConfigVariable", description: "%s Workspace error; configuration variable %s either not defined or has incorrect value", category: "configuration", kbArticleLink: "", canUserFix: true};
    public static NonLinearUnits: Error  = {key: "NonLinearUnits", description: "The root model is not using linear units.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#NonLinearUnits", canUserFix: true};
    public static DuplicateDataFound: Error  = {key: "DuplicateDataFound", description: "The file contains data that is spatial overlapping having similar identifiers compared to the existing content in the iModel. To prevent data problem the conversion was aborted. Details: %s", category: "data_conflict", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#DuplicateModels", canUserFix: true};
    public static AnotherUserPushing: Error  = {key: "AnotherUserPushing", description: "Another user is attempting to push data to the same iModel. Please try again in a few minutes.", category: "imodel_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098412", canUserFix: true};
    public static ZeroByte: Error  = {key: "ZeroByte", description: "File %s has a size of 0 bytes. Please check your datasource.", category: "data_conflict", kbArticleLink: "", canUserFix: true};
    public static SourceFileNotAccessible: Error  = {key: "SourceFileNotAccessible", description: "The source file is not accessible.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098399", canUserFix: true};
    public static SourceFileIsForbidden: Error  = {key: "SourceFileIsForbidden", description: "Source file pre-authenticated URL is expired.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098397", canUserFix: true};
    public static SourceFileNotFound: Error  = {key: "SourceFileNotFound", description: "Source file was not found at location.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098398", canUserFix: true};
    public static SourceFileCorrupted: Error  = {key: "SourceFileCorrupted", description: "The input file, %s, is likely corrupted. It cannot be opened by the connector. Try auditing & recovering the file in the product that has created it.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#SourceFileCorrupted", canUserFix: true};
    public static IncompleteDxfHeader: Error  = {key: "IncompleteDxfHeader", description: "The input DXF file, %s, is invalid. It has an incomplete or missing HEADER section, and potentially other problems as well. Try fixing the file in AutoCAD.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098395#IncompleteDxfFile", canUserFix: true};
    public static InvalidChangesetGroupId: Error  = {key: "InvalidChangesetGroupId", description: "The Connector was provided an invalid changeset group ID by the orchestrator.", category: "configuration", kbArticleLink: "", canUserFix: false};
    public static FailedToConnectToRemoteServerApplication: Error  = {key: "FailedToConnectToRemoteServerApplication", description: "Failed to connect to the remote server application to retrieve files.", category: "file_access", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098451", canUserFix: true};
    public static FailedToReaquireJobSubject: Error  = {key: "FailedToReaquireJobSubject", description: "Failed to re-acquire job subject during processing. Unable to continue processing.", category: "other", kbArticleLink: "", canUserFix: false};
    public static ECEFAlreadyExistsInIModel: Error  = {key: "ECEFAlreadyExistsInIModel", description: "The iModel already contains an ECEF coordinate system. The file with the projected GCS must be imported first.", category: "configuration", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098345", canUserFix: true};
    public static AllFilesHaveFailed: Error  = {key: "AllFilesHaveFailed", description: "Synchronization job was in the queue for too long and was canceled.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098417", canUserFix: false};
    public static DwgMissingGeometry: Error  = {key: "DwgMissingGeometry", description: "Entity '%s' is not displayed, entity handle=0x%llx. This may or may not indicate a problem depending on whether the entity is displayed in the source CAD application.", category: "other", kbArticleLink: "https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0098314#Dwg_0103", canUserFix: false};
  };
};
