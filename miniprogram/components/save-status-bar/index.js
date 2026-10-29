// 保存状态条：保存中 / 已保存 / 保存失败
Component({
  properties: {
    status: {
      type: String,
      value: 'none' // none | saving | saved | error
    }
  }
});
