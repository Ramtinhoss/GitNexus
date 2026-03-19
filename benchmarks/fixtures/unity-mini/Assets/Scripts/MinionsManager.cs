using System.Collections.Generic;

public class MinionsManager
{
  private readonly MinionFactory _factory = new MinionFactory();
  private readonly List<Minion> _minions = new List<Minion>();

  public void Spawn(string name)
  {
    _minions.Add(_factory.Create(name));
  }

  public int Count()
  {
    return _minions.Count;
  }
}
