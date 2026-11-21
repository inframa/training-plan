// 计算器输入弹窗：数字键 + 加减乘除，底部弹出小半屏，用于录入重量
// 注意：微信小程序禁用 eval / Function，故手写四则运算解析器
function evalExpr(s) {
  if (!s || !/^[\d+\-*/. ]+$/.test(s)) return null;
  // 把连续空格去掉
  s = s.replace(/\s+/g, '');
  if (!s) return null;

  let pos = 0;

  // 解析数字（含小数，可带前导负号）
  function parseNum() {
    let sign = 1;
    if (s[pos] === '-') { sign = -1; pos++; }
    else if (s[pos] === '+') { pos++; }
    const start = pos;
    while (pos < s.length && (/\d/.test(s[pos]) || s[pos] === '.')) pos++;
    if (pos === start) return null; // 没数字
    const n = parseFloat(s.slice(start, pos));
    if (isNaN(n)) return null;
    return sign * n;
  }

  // 乘除：* /
  function parseTerm() {
    let left = parseNum();
    if (left === null) return null;
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++];
      const right = parseNum();
      if (right === null) return null;
      if (op === '*') left = left * right;
      else {
        if (right === 0) return null;
        left = left / right;
      }
    }
    return left;
  }

  // 加减：+ -
  function parseExpr() {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = parseExpr();
  if (result === null || pos !== s.length || !isFinite(result)) return null;
  return Math.round(result * 100) / 100;
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
      if (k === 'C') {
        expr = '';
      } else if (k === 'back') {
        expr = expr.slice(0, -1);
      } else if (k === '=') {
        // 等号：直接计算当前表达式，不把 = 拼进去
        const r = evalExpr(expr);
        if (r === null) {
          wx.showToast({ title: '表达式有误', icon: 'none' });
          return;
        }
        expr = String(r);
      } else {
        expr += k;
      }
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
