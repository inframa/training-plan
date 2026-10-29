// 分类树工具：展开子孙集合，用于「选父级分类时同时命中子分类的动作」
// tree 结构：[{ label, children: [{ label }] }]

// 求某节点（含自身）的全部子孙标签集合
function descendantSet(tree, label) {
  const set = new Set();
  const walk = (nodes, target) => {
    for (const n of nodes || []) {
      const hit = target === null || n.label === target;
      if (hit) set.add(n.label);
      if (hit && n.children && n.children.length) walk(n.children, null);
      else walk(n.children, target);
    }
  };
  walk(tree, label);
  return set;
}

// 筛选匹配：selected 为空表示全部；动作部位命中 selected 自身或其子孙即匹配
function matchParts(selected, parts, tree) {
  if (!selected) return true;
  const set = descendantSet(tree, selected);
  return (parts || []).some((p) => set.has(p));
}

module.exports = { descendantSet, matchParts };
