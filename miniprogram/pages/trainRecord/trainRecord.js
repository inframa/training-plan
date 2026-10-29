// 每日训练记录：动作管理、训练组录入（重量用计算器）、容量实时计算、档位/把手逻辑、本地优先保存
const store = require('../../store/store');
const api = require('../../api/index');
const { uuid } = require('../../utils/uuid');
const { DATE_RE } = require('../../utils/constants');
const dateUtil = require('../../utils/date');
const cap = require('../../utils/capacity');
const { matchParts } = require('../../utils/parts');

Page({
  data: {
    date: '',
    dateTitle: '',
    title: '',
    remark: '',
    dayActions: [],
    totalVolume: '0',
    doneActionCount: 0,
    doneSetCount: 0,
    totalSetCount: 0,
    uncountedHint: false,
    saveStatus: 'none',
    today: '',
    // 动作选择弹层（左树右列表）
    showPicker: false,
    pickerKeyword: '',
    pickerPart: '',
    partTree: [],
    pickerList: [],
    pickerSelected: {},
    // 重量计算器
    calcVisible: false,
    calcAi: -1,
    calcSi: -1,
    calcValue: '',
    // 批量建组弹层
    showBatch: false,
    batchAi: -1,
    batchCount: '3',
    batchWeight: '',
    batchReps: '',
    // 删除单组撤销
    undo: null,
    undoText: ''
  },

  record: null,
  saveTimer: null,
  undoTimer: null,
  pushing: false,
  repush: false,

  onLoad(options) {
    let date = options.date || '';
    if (!DATE_RE.test(date) || dateUtil.isFutureDate(date)) {
      if (date) wx.showToast({ title: '不能选择未来日期', icon: 'none' });
      date = dateUtil.todayStr();
    }
    this.setData({
      date,
      today: dateUtil.todayStr(),
      partTree: store.getPartTree()
    });
    store.ready().then(() => this.load());
  },

  onShow() {
    // 从动作编辑页返回：回写新建动作
    const newId = store.takePendingAddActionId();
    if (newId) this.addActionById(newId);
  },

  onHide() {
    this.flushSave();
  },
  onUnload() {
    this.flushSave();
    if (this.undoTimer) clearTimeout(this.undoTimer);
  },

  flushSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      if (this.record && this.record.dayActions.length) this.doPush();
    }
  },

  buildTitle(date) {
    const d = dateUtil.parseDate(date);
    return d.getMonth() + 1 + '月' + d.getDate() + '日 周' + dateUtil.weekDayCN(date);
  },

  async load() {
    const date = this.data.date;
    let record = store.getLocalRecord(date);
    const pending = store.isPending(date);
    if (!pending) {
      try {
        const cloud = await api.record.get(date);
        if (cloud && cloud.exists) {
          const cloudTs = cloud.record.updatedAt || 0;
          if (!record || cloudTs > (record.updatedAt || 0)) {
            record = this.fromCloud(cloud);
          }
        }
      } catch (e) {
        // 离线：使用本地缓存
      }
    }
    if (!record) record = store.blankRecord(date);
    else if (record.updatedAt && !pending) store.saveLocalRecord(record); // 云端数据落本地缓存
    this.record = record;
    this.setData({
      title: record.title || '',
      remark: record.remark || '',
      dateTitle: this.buildTitle(date)
    });
    this.recompute();
  },

  // 云端结构 → 本地结构
  fromCloud(cloud) {
    return {
      id: cloud.record.id,
      date: cloud.record.date,
      title: cloud.record.title || (cloud.record.tags || []).join('·'),
      remark: cloud.record.remark || '',
      updatedAt: cloud.record.updatedAt || 0,
      dayActions: (cloud.dayActions || []).map((da) => ({
        id: da.id,
        actionId: da.actionId || '',
        snapshot: da.snapshot || { name: '未知动作', recordType: 'weight_reps' },
        seat: da.seat || '',
        handleType: da.handleType || (da.snapshot && da.snapshot.handleType) || '',
        sets: (da.sets || []).map((s) => ({
          id: s.id,
          setIndex: s.setIndex,
          weight: s.weight === null || s.weight === undefined ? '' : String(s.weight),
          reps: s.reps === null || s.reps === undefined ? '' : String(s.reps),
          done: !!s.done,
          remark: s.remark || ''
        }))
      }))
    };
  },

  // ---------- 保存（本地优先 + 防抖推送） ----------
  touch() {
    if (!this.record) return;
    store.saveLocalRecord(this.record);
    this.recompute();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.doPush();
    }, 1200);
  },

  async doPush() {
    if (!this.record || !this.record.dayActions.length) {
      // 空记录仅本地存在，不推送
      if (this.data.saveStatus !== 'none') this.setData({ saveStatus: 'none' });
      return;
    }
    if (this.pushing) {
      this.repush = true;
      return;
    }
    this.pushing = true;
    this.setData({ saveStatus: 'saving' });
    const ok = await store.pushRecord(this.record);
    this.setData({ saveStatus: ok ? 'saved' : 'error' });
    this.pushing = false;
    if (this.repush) {
      this.repush = false;
      this.schedulePush();
    }
  },

  schedulePush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.doPush();
    }, 800);
  },

  // ---------- 派生数据重算 ----------
  recompute() {
    const r = this.record;
    if (!r) return;
    const dayActions = r.dayActions.map((a) => ({
      ...a,
      seatChanged: !!a.seat && a.seat !== (a.snapshot.seat || ''),
      handleChanged: !!a.handleType && a.handleType !== (a.snapshot.handleType || ''),
      volume: cap.fmtVol(cap.actionVolume(a)),
      doneSets: cap.countDoneSets(a.sets),
      setsCount: (a.sets || []).length,
      thumb: (a.snapshot.imageFileIds && a.snapshot.imageFileIds[0]) || ''
    }));
    this.setData({
      dayActions,
      totalVolume: cap.fmtVol(cap.dayVolume(r.dayActions)),
      doneActionCount: cap.countDoneActions(r.dayActions),
      doneSetCount: cap.countDoneSets(r.dayActions.reduce((arr, a) => arr.concat(a.sets || []), [])),
      totalSetCount: cap.countTotalSets(r.dayActions),
      uncountedHint: cap.hasUncounted(r.dayActions)
    });
  },

  // ---------- 标题 / 备注 ----------
  onTitleInput(e) {
    this.record.title = e.detail.value;
    this.touch();
  },

  onRemark(e) {
    this.record.remark = e.detail.value;
    this.touch();
  },

  // ---------- 动作管理（左树右列表弹层） ----------
  openPicker() {
    const lib = store.getLibrary().filter((a) => !a.archived);
    this.pickerSource = lib;
    this.setData({ showPicker: true, pickerKeyword: '', pickerPart: '', pickerSelected: {}, partTree: store.getPartTree() });
    this.buildPickerList();
  },

  buildPickerList() {
    const kw = this.data.pickerKeyword.trim().toLowerCase();
    const { pickerPart, partTree } = this.data;
    const list = (this.pickerSource || []).filter((a) => {
      if (pickerPart && !matchParts(pickerPart, a.bodyParts, partTree)) return false;
      if (kw && a.name.toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
    this.setData({ pickerList: list });
  },

  onPickerKeyword(e) {
    this.setData({ pickerKeyword: e.detail.value }, () => this.buildPickerList());
  },

  onPickerTreeSelect(e) {
    const p = e.detail.label;
    this.setData({ pickerPart: this.data.pickerPart === p ? '' : p }, () => this.buildPickerList());
  },

  onPickerTreeChange(e) {
    store.setPartTree(e.detail.tree);
    this.setData({ partTree: store.getPartTree() }, () => this.buildPickerList());
  },

  onPickerTap(e) {
    const id = e.detail.id;
    const sel = { ...this.data.pickerSelected };
    if (sel[id]) delete sel[id];
    else sel[id] = true;
    this.setData({ pickerSelected: sel });
  },

  onCreateFromPicker() {
    this.setData({ showPicker: false });
    wx.navigateTo({ url: '/pages/actionEdit/actionEdit?from=record' });
  },

  confirmPicker() {
    const sel = this.data.pickerSelected;
    const ids = Object.keys(sel).filter((k) => sel[k]);
    let added = 0;
    ids.forEach((id) => {
      if (this.addActionById(id)) added++;
    });
    this.setData({ showPicker: false });
    if (added) wx.showToast({ title: '已添加 ' + added + ' 个动作', icon: 'none' });
  },

  closePicker() {
    this.setData({ showPicker: false });
  },

  // 添加动作（从动作库生成快照），返回是否添加成功
  addActionById(id) {
    if (!this.record) return false;
    if (this.record.dayActions.some((a) => a.actionId === id)) return false;
    const action = store.findAction(id);
    if (!action) return false;
    this.record.dayActions.push({
      id: uuid(),
      actionId: action.id,
      snapshot: {
        name: action.name,
        imageFileIds: action.imageFileIds || [],
        gym: action.gym || '',
        handleType: action.handleType || '',
        seat: action.defaultSeat || '',
        recordType: action.recordType
      },
      seat: action.defaultSeat || '',
      handleType: action.handleType || '',
      sets: []
    });
    this.touch();
    return true;
  },

  onRemoveAction(e) {
    const ai = e.currentTarget.dataset.ai;
    const name = this.record.dayActions[ai].snapshot.name;
    wx.showModal({
      title: '删除动作',
      content: '将删除「' + name + '」及其全部训练组，确定？',
      confirmColor: '#E5484D',
      success: (res) => {
        if (!res.confirm) return;
        this.record.dayActions.splice(ai, 1);
        this.touch();
      }
    });
  },

  // ---------- 训练组 ----------
  addSet(e) {
    const ai = e.currentTarget.dataset.ai;
    this.record.dayActions[ai].sets.push({ id: uuid(), setIndex: 0, weight: '', reps: '', done: false, remark: '' });
    this.renumber(ai);
    this.touch();
  },

  copyLastSet(e) {
    const ai = e.currentTarget.dataset.ai;
    const sets = this.record.dayActions[ai].sets;
    if (!sets.length) {
      wx.showToast({ title: '暂无可复制的组', icon: 'none' });
      return;
    }
    const last = sets[sets.length - 1];
    sets.push({ id: uuid(), setIndex: 0, weight: last.weight, reps: last.reps, done: false, remark: last.remark });
    this.renumber(ai);
    this.touch();
  },

  renumber(ai) {
    this.record.dayActions[ai].sets.forEach((s, j) => (s.setIndex = j + 1));
  },

  // 批量建组
  openBatch(e) {
    const ai = e.currentTarget.dataset.ai;
    this.setData({ showBatch: true, batchAi: ai, batchCount: '3', batchWeight: '', batchReps: '' });
  },
  closeBatch() {
    this.setData({ showBatch: false });
  },
  onBatchCount(e) {
    this.setData({ batchCount: e.detail.value });
  },
  onBatchWeight(e) {
    this.setData({ batchWeight: e.detail.value });
  },
  onBatchReps(e) {
    this.setData({ batchReps: e.detail.value });
  },
  confirmBatch() {
    const { batchAi, batchCount, batchWeight, batchReps } = this.data;
    const n = Math.min(20, Math.max(1, parseInt(batchCount, 10) || 0));
    if (!n) {
      wx.showToast({ title: '请输入组数', icon: 'none' });
      return;
    }
    const sets = this.record.dayActions[batchAi].sets;
    for (let i = 0; i < n; i++) {
      sets.push({ id: uuid(), setIndex: 0, weight: batchWeight, reps: batchReps, done: false, remark: '' });
    }
    this.renumber(batchAi);
    this.setData({ showBatch: false });
    this.touch();
  },

  // set-row 事件
  onSetInput(e) {
    const { ai, si } = e.currentTarget.dataset;
    const { field, value } = e.detail;
    const set = this.record.dayActions[ai].sets[si];
    set[field] = value;
    // 输入过程中只重算汇总，不整体刷新列表（避免输入框光标跳动）
    const r = this.record;
    this.setData({
      totalVolume: cap.fmtVol(cap.dayVolume(r.dayActions)),
      doneActionCount: cap.countDoneActions(r.dayActions),
      doneSetCount: cap.countDoneSets(r.dayActions.reduce((arr, a) => arr.concat(a.sets || []), [])),
      uncountedHint: cap.hasUncounted(r.dayActions)
    });
    store.saveLocalRecord(r);
    this.schedulePush();
  },

  onSetBlur(e) {
    const { ai, si } = e.currentTarget.dataset;
    const { field, value } = e.detail;
    const set = this.record.dayActions[ai].sets[si];
    let v = (value || '').trim();
    if (field === 'weight') {
      const m = v.match(/^\d*(\.\d{0,2})?/);
      v = m ? m[0] : '';
      if (parseFloat(v) <= 0) v = '';
    } else {
      v = v.replace(/[^\d]/g, '');
      if (parseInt(v, 10) <= 0) v = '';
    }
    set[field] = v;
    this.touch();
  },

  // 重量点击 → 计算器
  onWeightTap(e) {
    const { ai, si } = e.currentTarget.dataset;
    const set = this.record.dayActions[ai].sets[si];
    this.setData({ calcVisible: true, calcAi: ai, calcSi: si, calcValue: set.weight || '' });
  },

  onCalcConfirm(e) {
    const { ai, si } = this.data;
    if (ai < 0 || si < 0) return;
    const v = (e.detail.value || '').trim();
    this.record.dayActions[ai].sets[si].weight = v;
    this.setData({ calcVisible: false, calcAi: -1, calcSi: -1, calcValue: '' });
    this.touch();
  },

  onCalcClose() {
    this.setData({ calcVisible: false, calcAi: -1, calcSi: -1, calcValue: '' });
  },

  onSetToggle(e) {
    const { ai, si } = e.currentTarget.dataset;
    const set = this.record.dayActions[ai].sets[si];
    set.done = !set.done;
    this.touch();
  },

  onSetRemark(e) {
    const { ai, si } = e.currentTarget.dataset;
    const set = this.record.dayActions[ai].sets[si];
    wx.showModal({
      title: '组备注',
      editable: true,
      placeholderText: '如：临时调整档位等',
      content: set.remark || '',
      success: (res) => {
        if (res.cancel) return;
        set.remark = (res.content || '').trim();
        this.touch();
      }
    });
  },

  onSetCopy(e) {
    const { ai, si } = e.currentTarget.dataset;
    const sets = this.record.dayActions[ai].sets;
    const src = sets[si];
    sets.splice(si + 1, 0, { id: uuid(), setIndex: 0, weight: src.weight, reps: src.reps, done: false, remark: src.remark });
    this.renumber(ai);
    this.touch();
  },

  onSetRemove(e) {
    const { ai, si } = e.currentTarget.dataset;
    const sets = this.record.dayActions[ai].sets;
    const removed = sets.splice(si, 1)[0];
    this.renumber(ai);
    this.touch();
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.setData({ undo: { ai, si, set: removed }, undoText: '已删除第 ' + removed.setIndex + ' 组' });
    this.undoTimer = setTimeout(() => {
      this.setData({ undo: null, undoText: '' });
    }, 5000);
  },

  onUndo() {
    const u = this.data.undo;
    if (!u || !this.record) return;
    const sets = this.record.dayActions[u.ai] && this.record.dayActions[u.ai].sets;
    if (sets) {
      sets.splice(Math.min(u.si, sets.length), 0, u.set);
      this.renumber(u.ai);
      this.touch();
    }
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.setData({ undo: null, undoText: '' });
  },

  // ---------- 复制上次训练 ----------
  async copyLast(e) {
    const ai = e.currentTarget.dataset.ai;
    const act = this.record.dayActions[ai];
    try {
      const res = await api.record.lastAction({
        actionId: act.actionId || undefined,
        snapshotName: act.actionId ? undefined : act.snapshot.name,
        beforeDate: this.data.date
      });
      if (!res.found) {
        wx.showToast({ title: '暂无历史记录', icon: 'none' });
        return;
      }
      act.sets = (res.dayAction.sets || []).map((s) => ({
        id: uuid(),
        setIndex: 0,
        weight: s.weight === null || s.weight === undefined ? '' : String(s.weight),
        reps: s.reps === null || s.reps === undefined ? '' : String(s.reps),
        done: false,
        remark: s.remark || ''
      }));
      this.renumber(ai);
      this.touch();
      wx.showToast({ title: '已复制 ' + res.date.slice(5) + ' 的全部组', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '获取历史失败', icon: 'none' });
    }
  },

  // ---------- 座椅档位 / 把手类型 ----------
  onSeatInput(e) {
    const ai = e.currentTarget.dataset.ai;
    const seat = e.detail.value;
    const act = this.record.dayActions[ai];
    act.seat = seat;
    this.setData({
      ['dayActions[' + ai + '].seat']: seat,
      ['dayActions[' + ai + '].seatChanged']: !!seat && seat !== (act.snapshot.seat || '')
    });
    store.saveLocalRecord(this.record);
    this.schedulePush();
  },

  // 本次档位同步回动作库默认档位
  async syncSeat(e) {
    const ai = e.currentTarget.dataset.ai;
    const act = this.record.dayActions[ai];
    if (!act.actionId) {
      wx.showToast({ title: '该动作未关联动作库', icon: 'none' });
      return;
    }
    try {
      await api.action.update(act.actionId, { defaultSeat: act.seat });
      act.snapshot.seat = act.seat;
      this.recompute();
      this.touch();
      wx.showToast({ title: '已同步到动作库', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '同步失败', icon: 'none' });
    }
  },

  onHandleInput(e) {
    const ai = e.currentTarget.dataset.ai;
    const val = e.detail.value;
    const act = this.record.dayActions[ai];
    act.handleType = val;
    this.setData({
      ['dayActions[' + ai + '].handleType']: val,
      ['dayActions[' + ai + '].handleChanged']: !!val && val !== (act.snapshot.handleType || '')
    });
    store.saveLocalRecord(this.record);
    this.schedulePush();
  },

  // 本次把手类型同步回动作库默认值
  async syncHandle(e) {
    const ai = e.currentTarget.dataset.ai;
    const act = this.record.dayActions[ai];
    if (!act.actionId) {
      wx.showToast({ title: '该动作未关联动作库', icon: 'none' });
      return;
    }
    try {
      await api.action.update(act.actionId, { handleType: act.handleType });
      act.snapshot.handleType = act.handleType;
      this.recompute();
      this.touch();
      wx.showToast({ title: '已同步到动作库', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '同步失败', icon: 'none' });
    }
  },

  // ---------- 删除整日 ----------
  onDeleteDay() {
    wx.showModal({
      title: '删除整日记录',
      content: '将删除该日全部动作与训练组，确定？',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        const rec = this.record;
        if (this.saveTimer) clearTimeout(this.saveTimer);
        store.deleteLocalRecord(rec.date);
        store.pushDeleteDay(rec.id, rec.date);
        this.record = null;
        wx.navigateBack();
      }
    });
  }
});
