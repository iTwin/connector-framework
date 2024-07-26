import TestConnector from "./TestConnector";

export default class ChangeSetGroupTestConnector extends TestConnector {

  // __PUBLISH_EXTRACT_START__ CSGTestConnector-shouldCreateChangeSetGroup.cf-code
  public override shouldCreateChangeSetGroup(): boolean {
    return true;
  }
  // __PUBLISH_EXTRACT_END__

  public static override async create(): Promise<TestConnector> {
    return new ChangeSetGroupTestConnector();
  }
}
