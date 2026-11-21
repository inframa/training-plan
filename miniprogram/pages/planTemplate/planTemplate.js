Page({
  data: {
    presetList: [
      { id: 'push_pull', name: '推拉腿 三分法', desc: '推力日 / 拉力日 / 腿日 循环', color: '#2e6be6' },
      { id: 'upper_lower', name: '上下肢 二分法', desc: '上肢日 / 下肢日 循环', color: '#e6912e' },
      { id: 'full_body', name: '全身 一分法', desc: '每次全身训练，适合新手', color: '#2ba471' },
      { id: 'ppl', name: 'PPL 六循环', desc: 'Push / Pull / Leg × 两周循环', color: '#9a6be6' }
    ],
    myTemplates: []
  },

  onLoad() {
    this.loadMyTemplates();
  },

  onShow() {
    if (this.data.myTemplates.length === 0) this.loadMyTemplates();
  },

  loadMyTemplates() {
    // TODO: 从云端拉取用户自定义模板，先留空
    this.setData({ myTemplates: [] });
  },

  onPresetTap(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showToast({ title: '「' + name + '」功能开发中', icon: 'none' });
  },

  onCreateTemplate() {
    wx.showToast({ title: '创建模板功能开发中', icon: 'none' });
  }
});
