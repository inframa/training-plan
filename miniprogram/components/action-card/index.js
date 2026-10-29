// 动作卡片：动作库列表 / 动作选择弹层复用
const { RECORD_TYPE_LABEL } = require('../../utils/constants');

Component({
  properties: {
    action: { type: Object, value: null },
    selected: { type: Boolean, value: false }
  },
  data: {
    thumb: '',
    partsText: '',
    metaText: '',
    typeLabel: ''
  },
  observers: {
    action(a) {
      if (!a) return;
      this.setData({
        thumb: (a.imageFileIds && a.imageFileIds[0]) || '',
        partsText: (a.bodyParts || []).join('·'),
        metaText: [a.gym, a.handleType].filter(Boolean).join('·'),
        typeLabel: RECORD_TYPE_LABEL[a.recordType] || ''
      });
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('cardtap', { id: this.data.action && this.data.action.id });
    }
  }
});
