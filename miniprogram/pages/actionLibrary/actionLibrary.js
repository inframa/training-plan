// 个人动作库：左侧竖排分类树筛选、搜索、按健身房筛选、最近使用优先、归档恢复、删除
const store = require('../../store/store');
const api = require('../../api/index');
const { uuid } = require('../../utils/uuid');
const { matchParts } = require('../../utils/parts');

Page({
  data: {
    keyword: '',
    part: '',
    partTree: store.getPartTree(),
    gym: '',
    gyms: [],
    showArchived: false,
    list: [],
    loaded: false,
    gymSheetVisible: false
  },
  unsub: null,

  onLoad() {
    this.unsub = store.subscribe(() => this.rebuild());
    store.ready().then(() => this.rebuild());
  },

  onUnload() {
    if (this.unsub) this.unsub();
  },

  onShow() {
    if (store.isReady()) this.rebuild();
  },

  rebuild() {
    const all = store.getLibrary();
    // 健身房选项去重
    const gymSet = [];
    all.forEach((a) => {
      if (a.gym && gymSet.indexOf(a.gym) < 0) gymSet.push(a.gym);
    });
    const { keyword, part, partTree, gym, showArchived } = this.data;
    const kw = keyword.trim().toLowerCase();
    const list = all.filter((a) => {
      if (!showArchived && a.archived) return false;
      if (showArchived && !a.archived) return false;
      if (part && !matchParts(part, a.bodyParts, partTree)) return false;
      if (gym && a.gym !== gym) return false;
      if (kw && a.name.toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
    this.setData({ list, gyms: gymSet, loaded: true });
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value }, () => this.rebuild());
  },

  onClearKeyword() {
    this.setData({ keyword: '' }, () => this.rebuild());
  },

  // 分类树选择（再点一次取消筛选）
  onTreeSelect(e) {
    const p = e.detail.label;
    this.setData({ part: this.data.part === p ? '' : p }, () => this.rebuild());
  },

  // 分类树自定义（增删改名）
  onTreeChange(e) {
    const tree = e.detail.tree;
    store.setPartTree(tree);
    this.setData({ partTree: store.getPartTree() }, () => this.rebuild());
  },

  onTreeReset() {
    this.setData({ partTree: store.getPartTree(), part: '' }, () => this.rebuild());
  },

  onToggleArchived(e) {
    this.setData({ showArchived: e.detail.value }, () => this.rebuild());
  },

  onOpenGymSheet() {
    this.setData({ gymSheetVisible: true });
  },
  onCloseGymSheet() {
    this.setData({ gymSheetVisible: false });
  },
  onPickGym(e) {
    this.setData({ gym: e.currentTarget.dataset.gym, gymSheetVisible: false }, () => this.rebuild());
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/actionDetail/actionDetail?id=' + e.detail.id });
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/actionEdit/actionEdit' });
  },

  onEdit(e) {
    wx.navigateTo({ url: '/pages/actionEdit/actionEdit?id=' + e.currentTarget.dataset.id });
  },

  // 复制动作（保留全部器械信息）
  async onCopy(e) {
    const id = e.currentTarget.dataset.id;
    const newId = uuid();
    const src = store.findAction(id);
    const applyLocal = () => {
      if (!src) return;
      const now = Date.now();
      store.upsertAction({ ...src, id: newId, name: src.name + ' 副本', archived: false, lastUsedAt: now, createdAt: now, updatedAt: now });
    };
    try {
      await api.action.copy(id, newId);
      applyLocal();
      wx.showToast({ title: '已复制' });
    } catch (err) {
      if (err.code === 4001 && src) {
        // 离线：本地复制 + 排队同步
        applyLocal();
        store.queueActionOp('create', newId, store.findAction(newId));
        wx.showToast({ title: '已复制，稍后自动同步', icon: 'none' });
      } else {
        wx.showToast({ title: err.message || '复制失败', icon: 'none' });
      }
    }
    this.rebuild();
  },

  onArchive(e) {
    const id = e.currentTarget.dataset.id;
    const action = store.findAction(id);
    if (!action) return;
    const archived = !action.archived;
    store.upsertAction({ ...action, archived });
    api.action
      .archive(id, archived)
      .catch(() => store.queueActionOp('update', id, { ...action, archived }));
    wx.showToast({ title: archived ? '已归档' : '已恢复', icon: 'none' });
    this.rebuild();
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除动作',
      content: '删除后历史记录中的快照仍会保留，确定删除？',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        const action = store.findAction(id);
        store.removeAction(id);
        try {
          await api.action.remove(id);
        } catch (err) {
          store.queueActionOp('delete', id);
          if (err.code !== 4001) wx.showToast({ title: '已删除，稍后同步云端', icon: 'none' });
        }
        if (action) api.image.deleteFiles(action.imageFileIds);
        this.rebuild();
      }
    });
  }
});
