import TestConnector from "./TestConnector";

export default class NonSharedChannelKeyTestConnector extends TestConnector {

  public override getChannelKey(): string {
    return "TestConnectorChannel";
  }

  public static override async create(): Promise<TestConnector> {
    return new NonSharedChannelKeyTestConnector();
  }
}
