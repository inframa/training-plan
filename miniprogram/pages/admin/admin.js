const api = require('../../api/index');
const dateUtil = require('../../utils/date');

Page({
  data: {
    isAdmin: false,
    loading: true,
    tab: 'pending',          // pending / resolved / all / admins
    typeFilter: '',          // '' / bug / feature / experience / other
    keyword: '',             // 搜索关键词
    list: [],
    empty: false,
    stats: null,             // { total, pending, resolved, byType }
    replyInput: {},          // { feedbackId: text }
    expanded: {},            // 展开详情的 id 集合
    // 管理员管理
    admins: [],              // openid 列表
    isDefaultOpen: false,    // true = 默认所有人管理员（首次部署）
    myOpenid: ''             // 当前用户 openid（用于一键添加自己）
  },

  async onLoad() {
    try {
      const r = await api.feedback.checkAdmin();
      const myOpenid = (r && r.myOpenid) || '';
      this.setData({ isAdmin: !!(r && r.isAdmin), loading: false, myOpenid });
      if (this.data.isAdmin) {
        this.refresh();
        this.refreshStats();
        this.refreshAdmins();
      }
    } catch (e) {
      this.setData({ isAdmin: false, loading: false });
    }
  },

  onShow() {
    if (this.data.isAdmin) { this.refresh(); this.refreshStats(); this.refreshAdmins(); }
  },

  onPullDownRefresh() {
    Promise.all([this.refresh(), this.refreshStats(), this.refreshAdmins()]).finally(() => wx.stopPullDownRefresh());
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
    this.refresh();
  },

  onTypeFilter(e) {
    const t = e.currentTarget.dataset.type;
    this.setData({ typeFilter: this.data.typeFilter === t ? '' : t });
    this.refresh();
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.refresh();
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.refresh();
  },

  onToggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = Object.assign({}, this.data.expanded);
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },

  async refresh() {
    if (!this.data.isAdmin) return;
    try {
      const payload = {};
      if (this.data.tab !== 'all') payload.status = this.data.tab;
      if (this.data.typeFilter) payload.type = this.data.typeFilter;
      if (this.data.keyword) payload.keyword = this.data.keyword;
      const data = await api.feedback.listAll(payload);
      const enriched = data.map((f) => ({
        ...f,
        typeLabel: { bug: 'Bug', feature: '建议', experience: '体验', other: '其他' }[f.type] || '其他',
        timeLabel: dateUtil.formatTime(f.createdAt),
        resolvedTimeLabel: f.resolvedAt ? dateUtil.formatTime(f.resolvedAt) : '',
        repliedTimeLabel: f.repliedAt ? dateUtil.formatTime(f.repliedAt) : '',
        _expanded: !!this.data.expanded[f._id],
        _replyInput: this.data.replyInput[f._id] || ''
      }));
      this.setData({ list: enriched, empty: enriched.length === 0 });
    } catch (e) {
      wx.showToast({ title: '加载失败: ' + (e.message || ''), icon: 'none' });
    }
  },

  async refreshStats() {
    if (!this.data.isAdmin) return;
    try {
      const stats = await api.feedback.stats();
      this.setData({ stats });
    } catch (e) { /* 忽略 */ }
  },

  async onToggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    const curStatus = e.currentTarget.dataset.status;
    const nextStatus = curStatus === 'resolved' ? 'pending' : 'resolved';
    try {
      await api.feedback.markResolved(id, nextStatus);
      wx.showToast({ title: '已更新', icon: 'none' });
      this.refresh();
      this.refreshStats();
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  },

  onReplyInput(e) {
    const id = e.currentTarget.dataset.id;
    const replyInput = Object.assign({}, this.data.replyInput);
    replyInput[id] = e.detail.value;
    this.setData({ replyInput });
  },

  async onReplySubmit(e) {
    const id = e.currentTarget.dataset.id;
    const text = (this.data.replyInput[id] || '').trim();
    if (!text) { wx.showToast({ title: '回复内容不能为空', icon: 'none' }); return; }
    try {
      await api.feedback.reply(id, text);
      const replyInput = Object.assign({}, this.data.replyInput);
      replyInput[id] = '';
      this.setData({ replyInput });
      wx.showToast({ title: '回复已发送', icon: 'none' });
      this.refresh();
      this.refreshStats();
    } catch (e) {
      wx.showToast({ title: e.message || '回复失败', icon: 'none' });
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
          this.refreshStats();
        } catch (e) {
          wx.showToast({ title: e.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  onCopyContent(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({ data: content });
  },

  onCopyContact(e) {
    const c = e.currentTarget.dataset.contact;
    if (c) wx.setClipboardData({ data: c });
  },

  // ============ 管理员管理 ============

  async refreshAdmins() {
    if (!this.data.isAdmin) return;
    try {
      const r = await api.feedback.listAdmins();
      const patch = {
        admins: r.list || [],
        isDefaultOpen: !!r.isDefaultOpen
      };
      // 顺便拿到当前用户 openid（如果之前没拿到）
      if (r.myOpenid && !this.data.myOpenid) patch.myOpenid = r.myOpenid;
      this.setData(patch);
    } catch (e) { /* 忽略 */ }
  },

  async onAddSelf() {
    if (!this.data.myOpenid) { wx.showToast({ title: '获取不到 openid', icon: 'none' }); return; }
    try {
      await api.feedback.addAdmin(this.data.myOpenid, '我自己');
      wx.showToast({ title: '已添加自己为管理员', icon: 'success' });
      this.refreshAdmins();
    } catch (e) {
      wx.showToast({ title: e.message || '添加失败', icon: 'none' });
    }
  },

  async onAddAdmin() {
    wx.showModal({
      title: '添加管理员',
      editable: true,
      placeholderText: '粘贴 openid（o 开头）',
      confirmColor: '#2E6BE6',
      success: async (res) => {
        if (!res.confirm) return;
        const openid = (res.content || '').trim();
        if (!openid) { wx.showToast({ title: 'openid 不能为空', icon: 'none' }); return; }
        try {
          await api.feedback.addAdmin(openid, '');
          wx.showToast({ title: '添加成功', icon: 'success' });
          this.refreshAdmins();
        } catch (e) {
          wx.showToast({ title: e.message || '添加失败', icon: 'none' });
        }
      }
    });
  },

  async onRemoveAdmin(e) {
    const openid = e.currentTarget.dataset.openid;
    const isSelf = openid === this.data.myOpenid;
    if (isSelf) {
      wx.showToast({ title: '不能移除自己', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '移除管理员',
      content: openid.slice(0, 6) + '…' + openid.slice(-4),
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.feedback.removeAdmin(openid);
          wx.showToast({ title: '已移除', icon: 'success' });
          this.refreshAdmins();
        } catch (e) {
          wx.showToast({ title: e.message || '移除失败', icon: 'none' });
        }
      }
    });
  },

  onCopyOpenid(e) {
    const openid = e.currentTarget.dataset.openid;
    wx.setClipboardData({ data: openid, success: () => wx.showToast({ title: '已复制', icon: 'none' }) });
  },

  // 切 tab 时只在非 admins 时 refresh 反馈列表
  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab !== 'admins') this.refresh();
  }
});
