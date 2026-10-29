// 动作新建/编辑：字段录入、图片压缩上传、保存（本地优先）
// 训练部位使用竖排多级分类树多选；已删除器械位置描述、把手连接/握持位置、档位×次数
const store = require('../../store/store');
const api = require('../../api/index');
const { uuid } = require('../../utils/uuid');
const { RECORD_TYPES, HANDLE_TYPES } = require('../../utils/constants');

const EMPTY = {
  name: '',
  bodyParts: [],
  imageFileIds: [],
  gym: '',
  handleType: '',
  defaultSeat: '',
  otherSettings: '',
  recordType: 'weight_reps',
  remark: ''
};

Page({
  data: {
    isEdit: false,
    fromRecord: false,
    partTree: [],
    handleTypes: HANDLE_TYPES,
    recordTypes: RECORD_TYPES,
    form: { ...EMPTY },
    partSelected: {},
    partPickerVisible: false,
    images: [], // [{ tempPath, fileID, status }]
    errors: {},
    saving: false,
    id: ''
  },
  removedFileIds: [],

  onLoad(options) {
    const isEdit = !!options.id;
    this.setData({ isEdit, fromRecord: options.from === 'record', partTree: store.getPartTree() });
    if (isEdit) {
      this.setData({ id: options.id });
      store.ready().then(() => {
        const action = store.findAction(options.id);
        if (!action) return;
        const partSelected = {};
        (action.bodyParts || []).forEach((x) => (partSelected[x] = true));
        // 旧数据「档位×次数」已下线，统一归为「仅次数」
        const recordType = action.recordType === 'seat_reps' ? 'reps_only' : action.recordType || 'weight_reps';
        this.setData({
          partSelected,
          form: {
            name: action.name || '',
            bodyParts: (action.bodyParts || []).slice(),
            imageFileIds: (action.imageFileIds || []).slice(),
            gym: action.gym || '',
            handleType: action.handleType || '',
            defaultSeat: action.defaultSeat || '',
            otherSettings: action.otherSettings || '',
            recordType,
            remark: action.remark || ''
          },
          images: (action.imageFileIds || []).map((fid) => ({ tempPath: '', fileID: fid, status: 'done' }))
        });
      });
    }
  },

  // ---------- 表单 ----------
  onField(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value, ['errors.' + field]: false });
  },

  // ---------- 分类树多选部位 ----------
  openPartPicker() {
    this.setData({ partPickerVisible: true });
  },
  closePartPicker() {
    this.setData({ partPickerVisible: false });
  },
  onPartTreeChange(e) {
    store.setPartTree(e.detail.tree);
    this.setData({ partTree: store.getPartTree() });
  },

  onPartTreeToggle(e) {
    const p = e.detail.label;
    const list = this.data.form.bodyParts.slice();
    const idx = list.indexOf(p);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(p);
    const partSelected = {};
    list.forEach((x) => (partSelected[x] = true));
    this.setData({ 'form.bodyParts': list, partSelected, 'errors.bodyParts': false });
  },

  onRecordType(e) {
    this.setData({ 'form.recordType': e.currentTarget.dataset.type });
  },

  // ---------- 图片 ----------
  async onImagesAdd(e) {
    const files = e.detail.files || [];
    for (const tempPath of files) {
      const item = { tempPath, fileID: '', status: 'uploading' };
      const images = this.data.images.concat([item]);
      const idx = images.length - 1;
      this.setData({ images });
      try {
        const fileID = await api.image.upload(tempPath);
        this.setData({ ['images[' + idx + '].fileID']: fileID, ['images[' + idx + '].status']: 'done' });
      } catch (err) {
        this.setData({ ['images[' + idx + '].status']: 'error' });
      }
    }
  },

  onImagesRemove(e) {
    const { index } = e.detail;
    const item = this.data.images[index];
    if (item && item.fileID) this.removedFileIds.push(item.fileID);
    this.setData({ images: this.data.images.filter((x, i) => i !== index) });
  },

  async onImagesRetry(e) {
    const { index, tempPath } = e.detail;
    this.setData({ ['images[' + index + '].status']: 'uploading' });
    try {
      const fileID = await api.image.upload(tempPath);
      this.setData({ ['images[' + index + '].fileID']: fileID, ['images[' + index + '].status']: 'done' });
    } catch (err) {
      this.setData({ ['images[' + index + '].status']: 'error' });
    }
  },

  // ---------- 保存 ----------
  async onSave() {
    if (this.data.saving) return;
    const { form, images } = this.data;
    // 必填校验：名称 / 训练部位 / 记录类型
    const errors = {};
    if (!form.name.trim()) errors.name = true;
    if (!form.bodyParts.length) errors.bodyParts = true;
    if (!form.recordType) errors.recordType = true;
    if (Object.keys(errors).length) {
      this.setData({ errors });
      wx.showToast({ title: '请补全必填项', icon: 'none' });
      return;
    }
    if (images.some((x) => x.status === 'uploading')) {
      wx.showToast({ title: '图片上传中，请稍候', icon: 'none' });
      return;
    }
    const fileIds = images.filter((x) => x.status === 'done' && x.fileID).map((x) => x.fileID);
    const now = Date.now();
    const id = this.data.isEdit ? this.data.id : uuid();
    const existed = this.data.isEdit ? store.findAction(id) : null;
    const action = {
      id,
      name: form.name.trim(),
      bodyParts: form.bodyParts.slice(),
      imageFileIds: fileIds,
      gym: form.gym.trim(),
      handleType: form.handleType.trim(),
      defaultSeat: form.defaultSeat.trim(),
      otherSettings: form.otherSettings.trim(),
      recordType: form.recordType,
      remark: form.remark.trim(),
      archived: existed ? !!existed.archived : false,
      lastUsedAt: existed ? existed.lastUsedAt : now,
      createdAt: existed ? existed.createdAt : now,
      updatedAt: now
    };

    this.setData({ saving: true });
    // 本地立即保存（离线可用），失败进待同步队列
    store.upsertAction(action);
    store.queueActionOp(this.data.isEdit ? 'update' : 'create', id, action);
    try {
      if (this.data.isEdit) await api.action.update(id, action);
      else await api.action.create(action);
    } catch (err) {
      if (err.code === 4001) wx.showToast({ title: '已保存到本地，稍后自动同步', icon: 'none' });
      else wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
    if (this.removedFileIds.length) api.image.deleteFiles(this.removedFileIds);
    this.setData({ saving: false });
    if (this.data.fromRecord && !this.data.isEdit) {
      store.state.pendingAddActionId = id;
    }
    wx.navigateBack();
  }
});
