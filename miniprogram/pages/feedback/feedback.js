const api = require('../../api/index');
const dateUtil = require('../../utils/date');

Page({
  data: {
    types: [
      { id: 'bug', label: 'Bug 反馈' },
      { id: 'feature', label: '功能建议' },
      { id: 'experience', label: '体验优化' },
      { id: 'other', label: '其他' }
    ],
    selectedType: 'bug',
    content: '',
    contact: '',
    submitting: false,
    myList: [],
    showHistory: false
  },

  onLoad() {
    this.loadHistory();
  },

  onTypeTap(e) {
    this.setData({ selectedType: e.currentTarget.dataset.id });
  },

  onContent(e) {
    this.setData({ content: e.detail.value });
  },

  onContact(e) {
    this.setData({ contact: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const content = (this.data.content || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.feedback.submit(content, this.data.contact, this.data.selectedType);
      wx.showToast({ title: '提交成功，感谢反馈！', icon: 'none' });
      this.setData({ content: '', contact: '' });
      this.loadHistory();
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async loadHistory() {
    try {
      const list = await api.feedback.listMine();
      const enriched = list.map((f) => ({
        ...f,
        typeLabel: (this.data.types.find((t) => t.id === f.type) || { label: '其他' }).label,
        timeLabel: dateUtil.formatTime(f.createdAt),
        resolvedLabel: f.status === 'resolved' ? '已处理' : '待处理'
      }));
      this.setData({ myList: enriched });
    } catch (e) {
      // 忽略历史加载失败
    }
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  }
});
