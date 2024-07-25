import TestConnector from "./TestConnector";

export default class NonSharedChannelKeyTestConnector extends TestConnector {

  // __PUBLISH_EXTRACT_START__ NSCKTestConnector-getChannelKey.cf-code
  public override getChannelKey(): string {
    return "TestConnectorChannel";
  }
  // __PUBLISH_EXTRACT_END__

  public static override async create(): Promise<TestConnector> {
    return new NonSharedChannelKeyTestConnector();
  }
}
