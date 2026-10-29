// 动作详情：器械信息、最近一次训练、复制/归档/删除/编辑
const store = require('../../store/store');
const api = require('../../api/index');
const { uuid } = require('../../utils/uuid');
const { RECORD_TYPE_LABEL } = require('../../utils/constants');
const { tempFileURLs } = require('../../utils/image');

Page({
  data: {
    id: '',
    action: null,
    typeLabel: '',
    viewUrls: [],
    history: null, // { date, setsText, volume }
    fields: []
  },
  unsub: null,

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.unsub = store.subscribe(() => this.refresh());
    store.ready().then(() => this.refresh());
  },

  onUnload() {
    if (this.unsub) this.unsub();
  },

  refresh() {
    const action = store.findAction(this.data.id);
    if (!action) {
      this.setData({ action: null });
      return;
    }
    const fields = [
      ['健身房', action.gym],
      ['把手类型', action.handleType],
      ['默认座椅档位', action.defaultSeat],
      ['其他设置', action.otherSettings],
      ['备注', action.remark]
    ].filter((x) => x[1]);
    this.setData({
      action,
      typeLabel: RECORD_TYPE_LABEL[action.recordType] || '',
      fields
    });
    if (action.imageFileIds && action.imageFileIds.length) {
      tempFileURLs(action.imageFileIds).then((urls) => this.setData({ viewUrls: urls }));
    } else {
      this.setData({ viewUrls: [] });
    }
    this.loadHistory();
  },

  async loadHistory() {
    try {
      const res = await api.record.lastAction({
        actionId: this.data.id,
        beforeDate: dateAfterToday()
      });
      if (!res.found) {
        this.setData({ history: null });
        return;
      }
      const setsText = (res.dayAction.sets || []).map((s) => (s.weight != null ? s.weight + 'kg×' : '') + (s.reps != null ? s.reps + '次' : '')).join('，');
      let volume = 0;
      (res.dayAction.sets || []).forEach((s) => {
        if (s.done && s.weight != null && s.reps != null) volume += s.weight * s.reps;
      });
      this.setData({
        history: { date: res.date, setsText, volume: Math.round(volume * 100) / 100 }
      });
    } catch (e) {
      this.setData({ history: null });
    }
  },

  onPreview() {
    if (!this.data.viewUrls.length) return;
    wx.previewImage({ urls: this.data.viewUrls });
  },

  onEdit() {
    wx.navigateTo({ url: '/pages/actionEdit/actionEdit?id=' + this.data.id });
  },

  async onCopy() {
    const newId = uuid();
    const src = this.data.action;
    const applyLocal = () => {
      if (!src) return null;
      const now = Date.now();
      const copy = { ...src, id: newId, name: src.name + ' 副本', archived: false, lastUsedAt: now, createdAt: now, updatedAt: now };
      store.upsertAction(copy);
      return copy;
    };
    try {
      await api.action.copy(this.data.id, newId);
      applyLocal();
      wx.showToast({ title: '已复制' });
      wx.navigateTo({ url: '/pages/actionDetail/actionDetail?id=' + newId });
    } catch (err) {
      if (err.code === 4001 && src) {
        const copy = applyLocal();
        store.queueActionOp('create', newId, copy);
        wx.showToast({ title: '已复制，稍后自动同步', icon: 'none' });
        wx.navigateTo({ url: '/pages/actionDetail/actionDetail?id=' + newId });
      } else {
        wx.showToast({ title: err.message || '复制失败', icon: 'none' });
      }
    }
  },

  onArchive() {
    const action = this.data.action;
    const archived = !action.archived;
    store.upsertAction({ ...action, archived });
    api.action.archive(this.data.id, archived).catch(() => store.queueActionOp('update', this.data.id, { ...action, archived }));
    this.refresh();
  },

  onDelete() {
    wx.showModal({
      title: '删除动作',
      content: '删除后历史记录中的快照仍会保留，确定删除？',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        const action = this.data.action;
        store.removeAction(this.data.id);
        try {
          await api.action.remove(this.data.id);
        } catch (err) {
          store.queueActionOp('delete', this.data.id);
        }
        if (action) api.image.deleteFiles(action.imageFileIds);
        wx.navigateBack();
      }
    });
  },

  // 用该动作记录一次今天的训练
  onUse() {
    wx.navigateTo({ url: '/pages/trainRecord/trainRecord?date=' + require('../../utils/date').todayStr() });
  }
});

function dateAfterToday() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
