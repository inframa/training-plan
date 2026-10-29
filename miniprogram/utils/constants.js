// 全局常量
// 默认训练部位分类树：label 为节点名，children 为子分类（可多级），树支持用户自定义
const DEFAULT_PART_TREE = [
  {
    label: '胸',
    children: [
      { label: '上胸' },
      { label: '中下胸' }
    ]
  },
  {
    label: '背',
    children: [
      { label: '背阔肌' },
      { label: '大圆肌' },
      { label: '竖脊肌' },
      { label: '中下斜方肌' },
      { label: '上斜方肌' }
    ]
  },
  {
    label: '腿',
    children: [
      { label: '股四头肌' },
      { label: '腘绳肌' }
    ]
  },
  {
    label: '肩',
    children: [
      { label: '前束' },
      { label: '中束' },
      { label: '后束' }
    ]
  },
  { label: '前锯肌' },
  { label: '肱二头肌' },
  {
    label: '肱三头肌',
    children: [
      { label: '长头' },
      { label: '外侧头' }
    ]
  },
  { label: '小腿' },
  { label: '小臂' },
  { label: '臀' },
  {
    label: '腹部',
    children: [
      { label: '腹直肌' },
      { label: '侧腹' }
    ]
  },
  {
    label: '功能性训练',
    children: [
      { label: '核心' }
    ]
  }
];

// 把手类型常用选项（动作编辑/记录页可直接输入自定义值）
const HANDLE_TYPES = ['直杆', 'V把', 'EZ杆', '绳索', 'D把', '单把', '宽握', '窄握', '反握'];

// 记录类型（已删除「档位×次数」）
const RECORD_TYPES = [
  { value: 'weight_reps', label: '重量×次数', desc: '记录重量与次数，计入容量' },
  { value: 'reps_only', label: '仅次数', desc: '徒手/自重动作，只记次数，不计容量' }
];

const RECORD_TYPE_LABEL = {
  weight_reps: '重量×次数',
  reps_only: '仅次数',
  seat_reps: '档位×次数' // 旧数据兼容显示（新建已不可选）
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = { DEFAULT_PART_TREE, HANDLE_TYPES, RECORD_TYPES, RECORD_TYPE_LABEL, DATE_RE };
