using System;
using System.Collections.Generic;

namespace UnicodeSample {
  public class DataProcessor {
    public string 说明;
    public bool 是否启用;

    public void Process(DataItem 数据项) {
      if (数据项 != null) {
        说明 = 数据项.GetName();
        是否启用 = true;
      }
    }
  }

  public class DataItem {
    private string name;

    public DataItem(string initialName) {
      name = initialName;
    }

    public string GetName() {
      return name;
    }
  }
}
