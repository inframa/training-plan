// 竖排多级分类树：单选 / 多选 / 管理（增删改、拖拽排序/跨层级、全部折叠展开）
Component({
  properties: {
    tree: { type: Array, value: [] },
    selected: { type: String, value: '' },
    selectedList: { type: Array, value: [] },
    multi: { type: Boolean, value: false },
    allLabel: { type: String, value: '' },
    editable: { type: Boolean, value: false }
  },
  data: {
    rows: [],
    managing: false,
    dragging: false,
    dragPath: '',
    targetIdx: -1
  },
  observers: {
    'tree, selected, selectedList'() { this.rebuild(); }
  },
  lifetimes: {
    attached() {
      this._exp = {};
      this._svScrollY = 0;
      this._svTop = 0;
      this._rowH = 38; // 估算值，attached 后通过 selectorQuery 校准
      this.rebuild();
      // 测量 scroll-view 顶部位置和行高
      wx.createSelectorQuery().in(this)
        .select('.ctree-scroll').boundingClientRect((rect) => {
          if (rect) this._svTop = rect.top;
        })
        .select('.ctree-row').boundingClientRect((rect) => {
          if (rect && rect.height > 0) this._rowH = rect.height;
        })
        .exec();
    }
  },
  methods: {
    // ---------- 重建扁平行 ----------
    rebuild() {
      const { tree = [], selected = '', selectedList = [], multi, allLabel, managing } = this.data;
      if (!this._exp) this._exp = {};
      const rows = [];
      if (!multi && allLabel) {
        const anyExpanded = this._hasAnyExpanded(tree);
        rows.push({
          path: '__all__', label: allLabel, depth: 0,
          hasChildren: true, expanded: anyExpanded,
          selected: selected === ''
        });
      }
      const walk = (nodes, depth, parentPath) => {
        (nodes || []).forEach((n) => {
          const path = parentPath ? parentPath + '/' + n.label : n.label;
          const hasChildren = !!(n.children && n.children.length);
          const expanded = hasChildren && this._exp[path] !== false;
          const sel = multi ? selectedList.indexOf(n.label) >= 0 : selected === n.label;
          rows.push({ path, label: n.label, depth, hasChildren, expanded, selected: sel });
          if (hasChildren && expanded) walk(n.children, depth + 1, path);
        });
      };
      walk(tree, 0, '');
      // 管理模式下末尾追加「添加顶级」
      if (managing && !multi) {
        rows.push({ path: '__add_top__', label: '＋ 添加顶级分类', special: 'add', depth: 0, hasChildren: false, expanded: false, selected: false });
      }
      this.setData({ rows });
    },

    // ---------- 选择 ----------
    onTap(e) {
      const { path, label } = e.currentTarget.dataset;
      // 内部特殊路径不触发 select
      if (path === '__add_top__') { this.onAddTop(); return; }
      if (path === '__all__' && label === undefined) return;
      if (this.data.managing || this.data.dragging) return;
      if (!this.data.multi && this._exp && path !== '__all__') {
        if (this._exp[path] === undefined) this._exp[path] = true;
      }
      this.triggerEvent('select', { path, label });
    },

    onArrow(e) {
      const { path } = e.currentTarget.dataset;
      if (path === '__all__') {
        // 「全部」行箭头：循环切换所有子分类的折叠/展开
        if (this._hasAnyExpanded(this.data.tree)) this.onCollapseAll();
        else this.onExpandAll();
      } else {
        this._exp[path] = !(this._exp[path] !== false);
        this.rebuild();
      }
    },

    // ---------- 全部折叠 / 全部展开 ----------
    _hasAnyExpanded(nodes, parentPath) {
      for (const n of (nodes || [])) {
        const path = parentPath ? parentPath + '/' + n.label : n.label;
        if (n.children && n.children.length) {
          if (this._exp[path] !== false) return true;
          if (this._hasAnyExpanded(n.children, path)) return true;
        }
      }
      return false;
    },

    onCollapseAll() {
      this.setAllExpanded(this.data.tree, false);
      this.rebuild();
    },
    onExpandAll() {
      this.setAllExpanded(this.data.tree, true);
      this.rebuild();
    },
    setAllExpanded(nodes, val, parentPath) {
      (nodes || []).forEach((n) => {
        const path = parentPath ? parentPath + '/' + n.label : n.label;
        if (n.children && n.children.length) {
          this._exp[path] = val;
          this.setAllExpanded(n.children, val, path);
        }
      });
    },

    // ---------- 重命名 ----------
    onLongPress(e) {
      if (!this.data.editable || !this.data.managing || this.data.dragging) return;
      const { path } = e.currentTarget.dataset;
      if (path === '__all__' || path === '__add_top__') return;
      const { label } = e.currentTarget.dataset;
      wx.showModal({
        title: '重命名分类',
        editable: true,
        placeholderText: label,
        success: (res) => {
          if (!res.confirm) return;
          const name = (res.content || '').trim();
          if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return; }
          if (name === label) return;
          const tree = JSON.parse(JSON.stringify(this.data.tree));
          const node = this.findNode(tree, path);
          if (!node) return;
          node.label = name;
          this._exp = {};
          this.emitTree(tree);
        }
      });
    },

    // ---------- 添加 / 删除 ----------
    onAddChild(e) {
      const { path } = e.currentTarget.dataset;
      if (path === '__all__' || path === '__add_top__') return;
      const self = this;
      wx.showModal({
        title: '添加子分类',
        editable: true,
        placeholderText: '子分类名称',
        success(res) {
          if (!res.confirm) return;
          const name = (res.content || '').trim();
          if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return; }
          const tree = JSON.parse(JSON.stringify(self.data.tree));
          const node = self.findNode(tree, path);
          if (!node) return;
          if (!node.children) node.children = [];
          node.children.push({ label: name });
          self._exp[path] = true;
          self.emitTree(tree);
        }
      });
    },

    onAddTop() {
      const self = this;
      wx.showModal({
        title: '添加顶级分类',
        editable: true,
        placeholderText: '分类名称',
        success(res) {
          if (!res.confirm) return;
          const name = (res.content || '').trim();
          if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return; }
          const tree = JSON.parse(JSON.stringify(self.data.tree));
          tree.push({ label: name });
          self.emitTree(tree);
        }
      });
    },

    onDelete(e) {
      const { path, label } = e.currentTarget.dataset;
      if (path === '__all__' || path === '__add_top__') return;
      const self = this;
      wx.showModal({
        title: '删除分类',
        content: `确定删除「${label}」及其子分类吗？`,
        success(res) {
          if (!res.confirm) return;
          const tree = JSON.parse(JSON.stringify(self.data.tree));
          self.removeNode(tree, path);
          self._exp = {};
          self.emitTree(tree);
        }
      });
    },

    // ---------- 重置 / 管理开关 ----------
    onReset() {
      const self = this;
      wx.showModal({
        title: '恢复默认分类',
        content: '自定义分类将被清除，确定恢复默认分类树吗？',
        success(res) {
          if (!res.confirm) return;
          self._exp = {};
          self.triggerEvent('change', { tree: null });
          self.triggerEvent('reset');
        }
      });
    },

    onToggleManage() {
      const next = !this.data.managing;
      this.setData({ managing: next });
      this.rebuild();
      this.triggerEvent('managingchange', { managing: next });
    },

    // ---------- scroll / touch 事件（用于拖拽） ----------
    onScroll(e) {
      this._svScrollY = e.detail.scrollTop;
    },

    onDragStart(e) {
      if (!this.data.editable || !this.data.managing) return;
      const { path, idx } = e.currentTarget.dataset;
      if (path === '__all__' || path === '__add_top__') return;
      wx.vibrateShort({ type: 'light' });
      // 一次性测量 scroll-view 顶部位置
      wx.createSelectorQuery().in(this)
        .select('.ctree-scroll').boundingClientRect((rect) => {
          if (rect) this._svTop = rect.top;
        }).exec();
      this._drag = { path, startIdx: idx };
      this.setData({ dragging: true, dragPath: path, targetIdx: -1 });
    },

    onTouchMove(e) {
      if (!this.data.dragging || !this._drag) return;
      const ty = e.touches[0].clientY;
      const y = ty - this._svTop + this._svScrollY;
      let idx = Math.floor(y / this._rowH);
      const total = this.data.rows.length;
      idx = Math.max(0, Math.min(total - 1, idx));
      // 禁止拖到自己或自己的后代上
      const target = this.data.rows[idx];
      if (!target) return;
      if (target.path === this._drag.path) {
        if (this.data.targetIdx !== -1) this.setData({ targetIdx: -1 });
        return;
      }
      if (target.path.startsWith(this._drag.path + '/')) {
        if (this.data.targetIdx !== -1) this.setData({ targetIdx: -1 });
        return;
      }
      if (idx !== this.data.targetIdx) this.setData({ targetIdx: idx });
    },

    onTouchEnd() {
      if (!this.data.dragging || !this._drag) {
        this.setData({ dragging: false, dragPath: '', targetIdx: -1 });
        return;
      }
      const { dragPath, targetIdx } = this.data;
      const startIdx = this._drag.startIdx;
      this._drag = null;

      // 清掉拖拽态
      this.setData({ dragging: false, dragPath: '', targetIdx: -1 });

      if (targetIdx < 0 || targetIdx === startIdx) return;

      const rows = this.data.rows;
      const targetRow = rows[targetIdx];
      const targetPath = targetRow.path;
      if (!targetPath || targetPath === '__all__') return;

      // 执行移动
      const tree = JSON.parse(JSON.stringify(this.data.tree));
      const dragNode = this.extractNode(tree, dragPath);
      if (!dragNode) return;

      if (targetRow.hasChildren && targetRow.expanded) {
        // 拖到已展开的父节点上 → 作为它的子节点
        const tnode = this.findNode(tree, targetPath);
        if (!tnode) return;
        if (!tnode.children) tnode.children = [];
        tnode.children.push(dragNode);
        this._exp[targetPath] = true;
      } else {
        // 拖到同级节点 → 插到目标节点之后
        this.insertAfterSibling(tree, targetPath, dragNode);
      }
      this.emitTree(tree);
    },

    // ---------- 树工具方法 ----------
    extractNode(nodes, path) {
      // 从树中摘除 path 节点并返回它
      const segs = path.split('/');
      let list = nodes;
      for (let i = 0; i < segs.length - 1; i++) {
        const n = (list || []).find((x) => x.label === segs[i]);
        if (!n) return null;
        list = n.children;
      }
      const idx = (list || []).findIndex((x) => x.label === segs[segs.length - 1]);
      if (idx < 0) return null;
      return list.splice(idx, 1)[0];
    },

    insertAfterSibling(nodes, siblingPath, node) {
      // 在兄弟节点 siblingPath 之后插入 node
      const segs = siblingPath.split('/');
      let list = nodes;
      for (let i = 0; i < segs.length - 1; i++) {
        const n = (list || []).find((x) => x.label === segs[i]);
        if (!n) return false;
        list = n.children;
      }
      const idx = (list || []).findIndex((x) => x.label === segs[segs.length - 1]);
      if (idx < 0) return false;
      list.splice(idx + 1, 0, node);
      return true;
    },

    emitTree(tree) {
      this.setData({ tree });
      this.triggerEvent('change', { tree });
      this.rebuild();
    },

    findNode(nodes, path) {
      const segs = path.split('/');
      let list = nodes;
      let node = null;
      for (const seg of segs) {
        node = (list || []).find((n) => n.label === seg);
        if (!node) return null;
        list = node.children;
      }
      return node;
    },

    removeNode(nodes, path) {
      const segs = path.split('/');
      let list = nodes;
      for (let i = 0; i < segs.length - 1; i++) {
        const n = (list || []).find((x) => x.label === segs[i]);
        if (!n) return;
        list = n.children;
      }
      const idx = (list || []).findIndex((x) => x.label === segs[segs.length - 1]);
      if (idx >= 0) list.splice(idx, 1);
    },

    noop() {}
  }
});
