import TestConnector from './TestConnector';

export default class NonSharedChannelKeyTestConnector extends TestConnector {

   override getChannelKey (): string {
    return "TestConnectorChannel";
  }

  public static override async create(): Promise<TestConnector> {
    return new NonSharedChannelKeyTestConnector();
  }
}