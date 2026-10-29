// 竖排多级分类树：支持单选筛选 / 多选 / 自定义管理（增删改名、恢复默认）
Component({
  properties: {
    tree: { type: Array, value: [] },          // [{ label, children: [{label}] }]
    selected: { type: String, value: '' },     // 单选值
    selectedList: { type: Array, value: [] },  // 多选值
    multi: { type: Boolean, value: false },
    allLabel: { type: String, value: '' },     // 单选模式顶部"全部"节点，空则不显示
    editable: { type: Boolean, value: false }  // 是否显示管理入口
  },
  data: {
    rows: [],      // 扁平化显示行
    managing: false
  },
  observers: {
    'tree, selected, selectedList'() {
      this.rebuild();
    }
  },
  lifetimes: {
    attached() {
      if (!this._exp) this._exp = {};
      this.rebuild();
    }
  },
  methods: {
    rebuild() {
      const { tree = [], selected = '', selectedList = [], multi, allLabel, managing } = this.data;
      if (!this._exp) this._exp = {};
      const rows = [];
      if (!multi && allLabel) {
        rows.push({ path: '__all__', label: allLabel, depth: 0, hasChildren: false, expanded: false, selected: selected === '' });
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
      this.setData({ rows });
    },

    onTap(e) {
      const { path, label } = e.currentTarget.dataset;
      if (this.data.managing) return;
      // 单选：点父级同时展开并作为筛选值
      if (!this.data.multi && this._exp && path !== '__all__') {
        if (this._exp[path] === undefined) this._exp[path] = true;
      }
      this.triggerEvent('select', { path, label });
    },

    onArrow(e) {
      const { path } = e.currentTarget.dataset;
      this._exp[path] = !(this._exp[path] !== false);
      this.rebuild();
    },

    onLongPress(e) {
      if (!this.data.editable || !this.data.managing) return;
      const { path, label } = e.currentTarget.dataset;
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
          this._exp = {}; // 路径变化，重置展开态
          this.emitTree(tree);
        }
      });
    },

    onAddChild(e) {
      const { path } = e.currentTarget.dataset;
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

    onDelete(e) {
      const { path, label } = e.currentTarget.dataset;
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

    onReset() {
      const self = this;
      wx.showModal({
        title: '恢复默认分类',
        content: '自定义分类将被清除，确定恢复默认分类树吗？',
        success(res) {
          if (!res.confirm) return;
          self._exp = {};
          self.triggerEvent('change', { tree: null }); // null 表示恢复默认
          self.triggerEvent('reset');
        }
      });
    },

    onToggleManage() {
      this.setData({ managing: !this.data.managing });
      this.rebuild();
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
