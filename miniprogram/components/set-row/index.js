// 单组训练数据行
Component({
  properties: {
    set: { type: Object, value: {} },
    type: { type: String, value: 'weight_reps' } // weight_reps 显示重量入口（点击弹计算器）
  },
  methods: {
    // 重量改为计算器输入：点击后由页面弹出计算器
    onWeightTap() {
      this.triggerEvent('weighttap');
    },
    onReps(e) {
      this.triggerEvent('input', { field: 'reps', value: e.detail.value });
    },
    onRepsBlur(e) {
      this.triggerEvent('blur', { field: 'reps', value: e.detail.value });
    },
    onToggle() {
      this.triggerEvent('toggle');
    },
    onRemark() {
      this.triggerEvent('remark');
    },
    onCopy() {
      this.triggerEvent('copy');
    },
    onRemove() {
      this.triggerEvent('remove');
    }
  }
});
