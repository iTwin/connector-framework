import TestConnector from "./TestConnector";

export default class ChangeSetGroupTestConnector extends TestConnector {

  public override shouldCreateChangeSetGroup(): boolean {
    return true;
  }

  public static override async create(): Promise<TestConnector> {
    return new ChangeSetGroupTestConnector();
  }
}
