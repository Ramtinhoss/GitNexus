using UnityEngine;
using UnityEngine.UIElements;

public class EliteBossScreenController : MonoBehaviour {
  public UIDocument Screen;

  void Awake() {
    var root = Screen.rootVisualElement;
    root.AddToClassList("tooltip-box");
  }
}
