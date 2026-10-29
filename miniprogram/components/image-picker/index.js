// 图片选择器：最多 3 张，选择后压缩，状态分 上传中/成功/失败
const api = require('../../api/index');

Component({
  properties: {
    images: { type: Array, value: [] }, // [{ tempPath, fileID, status: uploading|done|error, viewUrl? }]
    max: { type: Number, value: 3 }
  },
  data: {
    busy: false
  },
  methods: {
    onAdd() {
      if (this.data.busy) return;
      const remain = this.data.max - this.data.images.length;
      if (remain <= 0) {
        wx.showToast({ title: '最多 ' + this.data.max + ' 张', icon: 'none' });
        return;
      }
      this.setData({ busy: true });
      api.image
        .pickAndCompress(remain)
        .then((files) => {
          this.triggerEvent('add', { files });
        })
        .catch(() => {})
        .then(() => this.setData({ busy: false }));
    },
    onRemove(e) {
      this.triggerEvent('remove', { index: e.currentTarget.dataset.index });
    },
    onRetry(e) {
      const item = this.data.images[e.currentTarget.dataset.index];
      if (item) this.triggerEvent('retry', { index: e.currentTarget.dataset.index, tempPath: item.tempPath });
    },
    onPreview(e) {
      const item = this.data.images[e.currentTarget.dataset.index];
      if (!item || item.status !== 'done') return;
      const done = this.data.images.filter((x) => x.status === 'done');
      const urls = done.map((x) => x.viewUrl || x.fileID);
      wx.previewImage({ current: urls[done.indexOf(item)], urls });
    }
  }
});
