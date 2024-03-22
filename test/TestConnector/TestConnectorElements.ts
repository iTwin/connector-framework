/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type { IModelDb} from "@itwin/core-backend";
import { GroupInformationElement, PhysicalElement, SpatialCategory } from "@itwin/core-backend";
import type { AxisAlignedBox3d, CodeScopeProps, CodeSpec, ElementProps, PhysicalElementProps, Placement3dProps } from "@itwin/core-common";
import { Code, IModelError, Placement3d } from "@itwin/core-common";
import type { Id64String} from "@itwin/core-bentley";
import { IModelStatus, Logger } from "@itwin/core-bentley";
import { TestConnectorLoggerCategory } from "./TestConnectorLoggerCategory";
import type { XYZProps, YawPitchRollProps } from "@itwin/core-geometry";
import { Point3d, YawPitchRollAngles } from "@itwin/core-geometry";
import type { TileBuilder } from "./TestConnectorGeometry";
import { EquilateralTriangleTileBuilder, HexagonBuilder, IsoscelesTriangleTileBuilder, LargeSquareTileBuilder, OctagonBuilder, PentagonBuilder, RectangleTileBuilder, RightTriangleTileBuilder, SmallSquareTileBuilder } from "./TestConnectorGeometry";

export enum CodeSpecs {
  Group = "TestConnector:Group",
}

export enum Categories {
  Category = "TestConnector",
  Casing = "Casing",
  Magnet = "Magnet",
}

export enum GeometryParts {
  SmallSquareCasing = "SmallSquareCasing",
  LargeSquareCasing = "LargeSquareCasing",
  RectangleCasing = "RectangleCasing",
  EquilateralTriangleCasing = "EquilateralTriangleCasing",
  IsoscelesTriangleCasing = "IsoscelesTriangleCasing",
  RightTriangleCasing = "RightTriangleCasing",
  CircularMagnet = "CircularMagnet",
  RectangularMagnet = "RectangularMagnet",
  PentagonCasing = "PentagonCasing",
  HexagonCasing = "HexagonCasing",
  OctagonCasing = "OctagonCasing",
}

export enum Materials {
  ColoredPlastic = "ColoredPlastic",
  MagnetizedFerrite = "MagnetizedFerrite",
}

const loggerCategory: string = TestConnectorLoggerCategory.Connector;

function toNumber(val: any): number {
  if (val === undefined)
    return 0.0;
  if (typeof(val) == "number")
    return val;
  if (typeof(val) == "string")
    return parseFloat(val);
  throw new IModelError(IModelStatus.BadRequest, `expected number. got ${val}`);
}

export class TestConnectorPhysicalElement extends PhysicalElement {
  /** @internal */
  public static override get className(): string { return "TestConnectorPhysicalElement"; }

  public condition?: string;

  public constructor(props: TestConnectorPhysicalProps, iModel: IModelDb) {
    super(props, iModel);
    this.condition = props.condition;
  }
  /** @internal */
  public override toJSON(): TestConnectorPhysicalProps {
    const val = super.toJSON() as TestConnectorPhysicalProps;
    val.condition = this.condition;
    return val;
  }

  protected static createElement(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any, tileBuilder: TileBuilder, classFullName: string): PhysicalElement {
    const code = TestConnectorGroup.createCode(imodel, physicalModelId, tile.guid);
    const categoryId = SpatialCategory.queryCategoryIdByName(imodel, definitionModelId, Categories.Category);
    if (undefined === categoryId) {
      throw new IModelError(IModelStatus.BadElement, "Unable to find category id for TestConnector category");
    }
    const stream = tileBuilder.createGeometry(categoryId, tile);
    let origin: XYZProps;
    let angles: YawPitchRollProps;

    if (tile.hasOwnProperty("Placement") && tile.Placement.hasOwnProperty("Origin")) {
      const xyz: XYZProps = {
        x: toNumber(tile.Placement.Origin.x),
        y: toNumber(tile.Placement.Origin.y),
        z: toNumber(tile.Placement.Origin.z),
      };
      origin = xyz;
    } else {
      origin = new Point3d();
    }

    if (tile.hasOwnProperty("Placement") && tile.Placement.hasOwnProperty("Angles")) {
      const yawp: YawPitchRollProps = {
        yaw: toNumber(tile.Placement.Angles.yaw),
        pitch: toNumber(tile.Placement.Angles.pitch),
        roll: toNumber(tile.Placement.Angles.roll),
      };
      angles = yawp;
    } else {
      angles = new YawPitchRollAngles();
    }

    // WIP - connector may be requested to apply an additional transform to spatial data
    // placement.TryApplyTransform(GetSpatialDataTransform());

    const placement: Placement3dProps = {
      origin,
      angles,
    };
    const targetPlacement: Placement3d = Placement3d.fromJSON(placement);

    const targetExtents: AxisAlignedBox3d = targetPlacement.calculateRange();
    if (!targetExtents.isNull && !imodel.projectExtents.containsRange(targetExtents)) {
      Logger.logTrace(loggerCategory, "Auto-extending projectExtents");
      targetExtents.extendRange(imodel.projectExtents);
      imodel.updateProjectExtents(targetExtents);
    }

    const props: TestConnectorPhysicalProps = {
      code,
      category: categoryId,
      model: physicalModelId,
      classFullName,
      geom: stream,
      condition: tile.condition,
      placement,
    };
    return imodel.elements.createElement(props);
  }

}

export namespace TestConnectorPhysicalElement { // eslint-disable-line no-redeclare
  export enum CasingMaterialType {
    Invalid,
    RedPlastic,
    GreenPlastic,
    BluePlastic,
    OrangePlastic,
    PurplePlastic,
    YellowPlastic,
  }
}

export class SmallSquareTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "SmallSquareTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new SmallSquareTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class LargeSquareTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "LargeSquareTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new LargeSquareTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class RectangleTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "RectangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new RectangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class EquilateralTriangleTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "EquilateralTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new EquilateralTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class RightTriangleTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "RightTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new RightTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class IsoscelesTriangleTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "IsoscelesTriangleTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new IsoscelesTriangleTileBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class PentagonTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "PentagonTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new PentagonBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class HexagonTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "HexagonTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new HexagonBuilder(imodel, definitionModelId), this.classFullName);
  }
}


export class OctagonTile extends TestConnectorPhysicalElement {
  public static override get className(): string { return "OctagonTile"; }

  public static create(imodel: IModelDb, physicalModelId: Id64String, definitionModelId: Id64String, tile: any): PhysicalElement {
    return this.createElement(imodel, physicalModelId, definitionModelId, tile, new OctagonBuilder(imodel, definitionModelId), this.classFullName);
  }
}

export class TestConnectorGroup extends GroupInformationElement {
  public static override get className(): string { return "TestConnectorGroup"; }
  public groupType?: string;
  public manufactureLocation?: string;
  public manufactureDate?: Date;

  public constructor(props: TestConnectorGroupProps, iModel: IModelDb) {
    super(props, iModel);
    this.groupType = props.groupType;
    this.manufactureLocation = props.manufactureLocation;
    this.manufactureDate = props.manufactureDate;
  }

  public override toJSON(): TestConnectorGroupProps {
    const val = super.toJSON() as TestConnectorGroupProps;
    val.groupType = this.groupType;
    val.manufactureDate = this.manufactureDate;
    val.manufactureLocation = this.manufactureLocation;
    return val;
  }

  public static createCode(iModelDb: IModelDb, scope: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iModelDb.codeSpecs.getByName(CodeSpecs.Group);
    return new Code({ spec: codeSpec.id, scope, value: codeValue });
  }
}

export interface TestConnectorPhysicalProps extends PhysicalElementProps {
  condition?: string;
}

export interface TestConnectorGroupProps extends ElementProps {
  groupType?: string;
  manufactureLocation?: string;
  manufactureDate?: Date;
}
