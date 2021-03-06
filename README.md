# iTwin Connector Framework

[![Build Status](https://bentleycs.visualstudio.com/iModelTechnologies/_apis/build/status/iTwin%20Connector%20Frameworks/iTwin.connector-framework?repoName=iTwin%2Fconnector-framework&branchName=main)](https://bentleycs.visualstudio.com/iModelTechnologies/_build/latest?definitionId=5669&repoName=iTwin%2Fconnector-framework&branchName=main)

The **@itwin/connector-framework** package contains the classes which comprise the framework necessary to author [iModel Connectors](https://www.itwinjs.org/learning/imodel-connectors/#imodel-connectors).
    In previous versions <= 2.x of the iTwin.js (iModel.js) SDK, it was included as part of the monorepo under IModelBridge.  Going forward it will be a separate repository.

## Documentation

### Quick Upgrade Guide

#### To port TypeScript/JavaScript connectors based on previous versions <= 2.x of of the iTwin.js (iModel.js) SDK, the following changes must be made

1. The word `"itwin"` replaces `"imodel"` and `"connector"` replaces `"bridge"`.

    e.g. the class `iModelBridge` becomes `iTwinConnector`

2. TypeScript source files should import the new classes from `@itwin/connector-framework`.

    e.g.

    ``` javascript
    import { iTwinConnector } from "@itwin/connector-framework";
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

## Changelog

For any PR with changes beyond something exceedingly minor, an update changelog will be required for a pull request. This changelog can be added to CHANGELOG.md manually in a similar format to what is already there.
