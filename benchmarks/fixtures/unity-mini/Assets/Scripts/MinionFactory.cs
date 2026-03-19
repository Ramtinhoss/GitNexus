public class MinionFactory
{
  public Minion Create(string name)
  {
    return new Minion(name);
  }
}
