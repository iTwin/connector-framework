# iTwin Connector Framework

[![Build Status](https://bentleycs.visualstudio.com/iModelTechnologies/_apis/build/status/iTwin%20Connector%20Frameworks/iTwin.connector-framework?repoName=iTwin%2Fconnector-framework&branchName=main)](https://bentleycs.visualstudio.com/iModelTechnologies/_build/latest?definitionId=5669&repoName=iTwin%2Fconnector-framework&branchName=main)

The **@itwin/connector-framework** package contains the classes which comprise the framework necessary to author [iModel Connectors](https://www.itwinjs.org/learning/imodel-connectors/#imodel-connectors).
    In previous versions <= 2.x of the iTwin.js (iModel.js) SDK, it was included as part of the monorepo under IModelBridge.  Going forward it will be a separate repository.

## Documentation

### Lifecycle policy
The main branch used for 2.x, based on iTwin.js 4.x, will be the default location for all fixes and enhancements. Patches will only be back-ported to 1.x if they are considered critical or related to security.

Version 1.x of the connector framework will be supported as long as iTwin.js 3.x is supported. Please refer to the [iTwin.js API deprecation policy](https://www.itwinjs.org/learning/api-support-policies/#package-support-policy).

### Running the Integration Tests

You may want to run the integration test and see the results hosted on the iModelHub.  This is possible by setting a few environment variables to specify private/confidential parameters such as iTwin (project) id and iModel id, an AuthClient id, and user name and password.

An example .env file may look like ...

``` shell

test_client_id=<client id here in quotes>
test_redirect_uri=<uri here in quotes>
test_scopes="imodels:modify imodels:read itwin-platform"

test_user_name=<valid email here in quotes>
test_user_password=<password corresponding>

# leave imjs_url_prefix undefined(or comment out) for prod
imjs_url_prefix = "qa-"

# if you optionally wish to authenticate with a callback URL and 
# bypass the default authentication for the Integration tests,
# you can specify test_callbackUrl
# test_callbackUrl=<url goes here>

```

### Quick Upgrade Guide

#### To port TypeScript/JavaScript connectors based on previous versions <= 2.x of of the iTwin.js (iModel.js) SDK, the following changes must be made

1. The word `"itwin"` replaces `"imodel"` and `"connector"` replaces `"bridge"`.

2. TypeScript source files should import the new classes from `@itwin/connector-framework`.

    e.g.

    ``` javascript
    import { BaseConnector } from "@itwin/connector-framework";
    ```

3. package.json should include a dependency for `@itwin/connector-framework`

    ``` json
    {
      "dependencies": {
        "@itwin/connector-framework": "latest"
       }
    }
    ```

4. The following scopes are required: `imodels:modify` `imodels:read`

### Refer to [write-a-connector](https://www.itwinjs.org/learning/writeaconnector/) documentation for more details

### Note:
NPM version 7.X and up is recommended. If you are using a lower version, you will have to manually install Peer Dependencies.

## Changelog

For any PR with changes beyond something exceedingly minor, an update changelog will be required for a pull request. This changelog can be added to CHANGELOG.md manually in a similar format to what is already there.
