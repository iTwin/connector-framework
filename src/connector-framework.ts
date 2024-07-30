/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export * from "./Args";
export * from "./LoggerCategory";
export * from "./ConnectorRunner";
export * from "./BaseConnector";
export * from "./Synchronizer";

/** @docs-package-description
 * The connector-framework package contains classes for [authoring iTwin Connectors]($docs/learning/WriteAConnector.md).
 */

/**
 * @docs-group-description Args
 * Classes for storing the command line arguments for an iTwin Connector.
 */

/**
 * @docs-group-description BaseConnector
 * The base class for all iTwin Connectors.
 */

/**
 * @docs-group-description ConnectorIssueReporter
 * Class for reporting an iTwin Connector's status and/or errors back to orchestrators or othe callers/launchers of Connectors.
 */

/**
 * @docs-group-description ConnectorRunner
 * Class responsible for loading the connector from a JavaScript source file and running it.
 */

/**
 * @docs-group-description Framework
 * Class describing the overall package as an aggregation of the various component classes: ConnectorRunner, BaseConnector, Synchronizer, etc.
 */

/**
 * @docs-group-description Logging
 * Module for providing messages to connector developers, testers and users of a range of severity levels from informational to error level.
 */

/**
 * @docs-group-description SqliteIssueReporter
 * A Subclass of a ConnectorIssueReporter for SQLite related issues.
 */

/**
 * @docs-group-description ConnectorAuthenticationManager
 * A class for encapsulating and initializing auth clients and the retrieving and caching of tokens.
 */

/**
 * @docs-group-description ChangeSetGroup
 * A class with methods for creating, getting and closing ChangeSetGroups which is used by the ConnectorRunner.
 * Should not need to be used directly by Connector developers.
 */
