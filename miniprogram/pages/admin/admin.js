const api = require('../../api/index');
const dateUtil = require('../../utils/date');

Page({
  data: {
    isAdmin: false,
    loading: true,
    tab: 'pending', // pending / resolved / all
    list: [],
    empty: false
  },

  async onLoad() {
    try {
      const r = await api.feedback.checkAdmin();
      this.setData({ isAdmin: !!r, loading: false });
      if (this.data.isAdmin) this.refresh();
    } catch (e) {
      this.setData({ isAdmin: false, loading: false });
    }
  },

  onShow() {
    if (this.data.isAdmin) this.refresh();
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
    this.refresh();
  },

  async refresh() {
    if (!this.data.isAdmin) return;
    try {
      const status = this.data.tab === 'all' ? null : this.data.tab;
      const data = await api.feedback.listAll(status);
      const enriched = data.map((f) => ({
        ...f,
        typeLabel: (f.type === 'bug' ? 'Bug' : f.type === 'feature' ? '建议' : f.type === 'experience' ? '体验' : '其他'),
        timeLabel: dateUtil.formatTime(f.createdAt),
        resolvedTimeLabel: f.resolvedAt ? dateUtil.formatTime(f.resolvedAt) : ''
      }));
      this.setData({ list: enriched, empty: enriched.length === 0 });
    } catch (e) {
      wx.showToast({ title: '加载失败: ' + (e.message || ''), icon: 'none' });
    }
  },

  async onToggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    const curStatus = e.currentTarget.dataset.status;
    const nextStatus = curStatus === 'resolved' ? 'pending' : 'resolved';
    try {
      await api.feedback.markResolved(id, nextStatus);
      wx.showToast({ title: '已更新', icon: 'none' });
      this.refresh();
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除反馈',
      content: '确定删除这条反馈吗？不可恢复。',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.feedback.del(id);
          wx.showToast({ title: '已删除', icon: 'none' });
          this.refresh();
        } catch (e) {
          wx.showToast({ title: e.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  onCopyContent(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({ data: content });
  }
});
