// 计算器输入弹窗：数字键 + 加减乘除，底部弹出小半屏，用于录入重量
function evalExpr(s) {
  if (!s || !/^[\d+\-*/. ]+$/.test(s)) return null;
  try {
    // 输入已通过白名单校验，仅数字与四则运算符
    const r = Function('"use strict";return (' + s + ')')();
    if (typeof r !== 'number' || !isFinite(r)) return null;
    return Math.round(r * 100) / 100;
  } catch (e) {
    return null;
  }
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    value: { type: String, value: '' },
    title: { type: String, value: '输入重量' }
  },
  data: {
    expr: '',
    preview: ''
  },
  observers: {
    visible(v) {
      if (v) this.setData({ expr: this.data.value || '', preview: '' });
    }
  },
  methods: {
    onKey(e) {
      const k = e.currentTarget.dataset.key;
      let { expr } = this.data;
      if (k === 'C') expr = '';
      else if (k === 'back') expr = expr.slice(0, -1);
      else expr += k;
      this.update(expr);
    },

    onEq() {
      const r = evalExpr(this.data.expr);
      if (r === null) {
        wx.showToast({ title: '表达式有误', icon: 'none' });
        return;
      }
      this.update(String(r));
    },

    update(expr) {
      const r = evalExpr(expr);
      this.setData({ expr, preview: r === null ? '' : String(r) });
    },

    onConfirm() {
      const { expr } = this.data;
      if (!expr) {
        this.triggerEvent('confirm', { value: '' });
        return;
      }
      const r = evalExpr(expr);
      if (r === null) {
        wx.showToast({ title: '表达式有误', icon: 'none' });
        return;
      }
      this.triggerEvent('confirm', { value: String(r) });
    },

    onClose() {
      this.triggerEvent('close');
    },

    noop() {}
  }
});
