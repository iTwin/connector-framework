import TestConnector from './TestConnector';

export class NonSharedChannelKeyTestConnector extends TestConnector {

   override getChannelKey (): string {
    return "TestConnectorChannel";
  }
}