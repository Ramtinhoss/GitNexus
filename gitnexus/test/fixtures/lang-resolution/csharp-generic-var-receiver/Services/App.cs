using GenericVarReceiver.Models;

namespace GenericVarReceiver.Services;

public class App
{
    public void Run()
    {
        var user = GetComponentInParent<User>();
        user.Save();
    }

    private T GetComponentInParent<T>() where T : class, new()
    {
        return new T();
    }
}
