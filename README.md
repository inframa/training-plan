# 健身容量记录小程序

基于 **微信原生小程序 + 微信云开发** 的个人健身训练容量记录工具。

> 完整操作手册见 → [user-manual/user-manual.html](user-manual/user-manual.html)
> 管理后台 Web 端见 → [web/admin.html](web/admin.html)

---

## ✨ 功能概览

### 训练日历（首页 Tab）
- 月历渲染、日期状态（今天 / 选中 / 有记录 / 未训练 / 未来）
- 每日训练摘要（标题 + 容量）、日期跳转、历史补录

### 每日训练记录
- 多动作训练组录入：添加 / 复制上一组 / 批量建组 / 复制上次训练
- 容量实时计算（重量 × 次数，仅已完成且数据完整的组计入）
- **内置计算器**（手写递归下降 parser，小程序禁用 eval/Function 时仍可安全运算）
- 座椅档位记录（本次修改不回写动作库，可手动同步）
- 保存状态三态：已保存 / 保存中 / 待同步

### 个人动作库（Tab）
- 动作 CRUD、复制、归档 / 恢复
- 搜索 + 部位 / 健身房筛选、最近使用优先
- 图片压缩上传（最多 3 张）
- 快照机制：当日保存动作信息快照，动作库编辑 / 归档 / 删除不追溯影响历史

### 训练计划模板（Tab）
- 预设训练计划模板浏览与套用

### 我的（Tab）
- 个人设置、反馈通道入口、关于彩蛋

### 反馈通道
- **用户端**：`pages/feedback` 提交反馈（bug / feature / experience / other），查看历史记录与管理员回复
- **Web 管理台**：[web/admin.html](web/admin.html)（单文件，匿名登录 + ADMIN_KEY 鉴权）
- **小程序彩蛋**：关于页连续点击版本号 v1.0 七次进入管理员页面
- **云函数**：`feedback`，11 个 action（含管理员增删）：submit / list / listAll / reply / markResolved / delete / stats / checkAdmin / listAdmins / addAdmin / removeAdmin
- **自动联动**：管理员回复 → 自动标记已处理；标记已处理无回复 → 自动补默认回复

### 容量计算引擎
- 单组容量 = 重量 × 次数
- 仅已完成且数据完整的组参与
- 徒手 / 档位类不计容量并提示

### 数据架构
- **离线优先**：所有写操作先落本地 storage，再推云端
- **自动同步**：启动 / 网络恢复自动按日期增量推送，服务端按 `(_openid, date)` 幂等 upsert
- **用户隔离**：全部数据表按 `_openid` 隔离

---

## 🗂 目录结构

```
training-plan/
├── miniprogram/                 # 小程序前端
│   ├── app.js                   # 全局入口：云开发初始化、登录、离线同步监听
│   ├── app.json                 # 页面路由 + tabBar（4 Tab：日历/动作库/计划/我的）
│   ├── app.wxss                 # 全局样式
│   ├── sitemap.json
│   │
│   ├── api/                     # 云函数调用封装
│   │   ├── core.js              # 通用 callFunction 封装 + 错误处理
│   │   ├── login.js             # 登录
│   │   ├── action.js            # 动作库 CRUD
│   │   ├── record.js            # 训练记录
│   │   ├── feedback.js          # 反馈通道
│   │   ├── image.js             # 图片上传
│   │   └── index.js             # 统一导出
│   │
│   ├── store/
│   │   └── store.js             # 全局状态 + 离线同步队列
│   │
│   ├── utils/
│   │   ├── capacity.js          # 容量计算
│   │   ├── date.js              # 日期工具
│   │   ├── storage.js           # 本地存储
│   │   ├── image.js             # 图片压缩
│   │   ├── uuid.js              # UUID 生成
│   │   ├── constants.js         # 常量定义
│   │   └── parts.js             # 身体部位数据
│   │
│   ├── components/
│   │   ├── calendar-grid/       # 日历格子
│   │   ├── action-card/         # 动作卡片
│   │   ├── set-row/             # 训练组行
│   │   ├── calculator/          # 内置计算器（手写递归下降 parser）
│   │   ├── category-tree/       # 部位树形筛选
│   │   ├── image-picker/        # 图片选择器
│   │   └── save-status-bar/     # 保存状态条
│   │
│   ├── pages/
│   │   ├── calendar/            # 训练日历（首页 Tab）
│   │   ├── actionLibrary/       # 动作库（Tab）
│   │   ├── planTemplate/        # 训练计划模板（Tab）
│   │   ├── mine/                # 我的（Tab）
│   │   ├── trainRecord/         # 每日训练记录
│   │   ├── actionEdit/          # 动作编辑
│   │   ├── actionDetail/        # 动作详情
│   │   ├── feedback/            # 反馈提交 + 历史
│   │   └── admin/               # 小程序端管理员页面（彩蛋入口）
│   │
│   └── images/tab/              # tabBar 图标（4 组 × 2：普通 + 选中态）
│
├── cloudfunctions/               # 云函数
│   ├── login/                   # 换取 openid，维护 user 表
│   ├── action/                  # 动作库 list/detail/create/update/copy/archive/delete
│   ├── record/                  # 训练记录 save/get/month/lastAction/delete
│   ├── feedback/                # 反馈通道（11 个 action + admins 集合鉴权）
│   └── init/                    # 创建业务集合（部署后执行一次）
│
├── web/
│   └── admin.html                # 单文件 Web 管理台（CDN 引入 @cloudbase/js-sdk）
│
├── user-manual/
│   └── user-manual.html          # 操作手册 v1.1
│
├── cloudbaserc.json              # 云开发配置（envId 用 {{env.ENV_ID}} 占位）
├── project.config.json           # 小程序项目配置（appid: wxd965dd25294fbdab）
└── README.md
```

---

## 🗄 数据表结构

全部集合按 `_openid` 字段隔离用户数据。

| 集合 | 说明 | 关键字段 |
|------|------|----------|
| `user` | 用户表 | `_openid`, `createdAt` |
| `action` | 动作库 | `_openid`, `name`, `part`, `gym`, `type`, `images[]`, `archived`, `lastUsedAt` |
| `dailyRecord` | 每日训练快照 | `_openid`, `date`（YYYY-MM-DD）, `title`, `totalAi`, `createdAt`, `updatedAt` |
| `dayAction` | 每日动作 | `_openid`, `dailyRecordId`, `actionSnapshot{}`, `seatLevel`, `sets[]` |
| `setRecord` | 训练组 | `_openid`, `dayActionId`, `weight`, `reps`, `done`, `calcAi` |
| `feedback` | 用户反馈 | `_openid`, `submitter`, `type`, `content`, `contact`, `status`(pending/resolved), `createdAt`, `resolvedAt`, `adminReply`, `repliedAt` |
| `admins` | 管理员 openid 白名单 | `openid`, `remark`, `addedBy`, `addedAt`（**为空时默认所有人都是管理员**） |

### 建议索引
- `dailyRecord`：`_openid + date` 联合唯一索引
- `action`：`_openid + lastUsedAt`
- `dayAction`：`_openid + dailyRecordId`
- `setRecord`：`_openid + dayActionId`
- `feedback`：`_openid + createdAt`

---

## 🚀 快速开始

### 环境要求
- 微信开发者工具（基础库 ≥ 2.30.0，项目配置为 2.33.0）
- 开通微信云开发并创建环境

### 部署步骤

**1. 导入项目**

微信开发者工具 → 导入项目 → 选择本目录，AppID 已在 `project.config.json` 配置（`wxd965dd25294fbdab`）。

**2. 云开发初始化**

`miniprogram/app.js` 中不传 `env`，默认使用默认云环境。多环境场景下请填入环境 ID：

```js
wx.cloud.init({ env: 'your-env-id' });
```

**3. 部署云函数**

右键 `cloudfunctions/` 下各云函数目录 → **上传并部署：云端安装依赖**。需要部署 5 个：

| 云函数 | 说明 |
|--------|------|
| `login` | 登录鉴权 |
| `action` | 动作库管理 |
| `record` | 训练记录 |
| `feedback` | 反馈通道（**需配置 ADMIN_KEY**，见下方） |
| `init` | 首次部署执行一次，创建业务集合 |

**4. 初始化数据库**

云开发控制台 → 云函数 → `init` → **测试**，自动创建 7 个集合（新增 `feedback` 和 `admins`）。

**5. 配置反馈管理员（可选）**

编辑 `cloudfunctions/feedback/index.js` 中的 ADMIN_KEY（Web 端 + 小程序彩蛋通用密钥）：

```js
const ADMIN_KEY = 'change-me-please-2026';   // 改成你自己的强密钥
```

**首次部署默认所有人都是管理员**（`admins` 集合为空时自动开放）。建议首次登录后尽快通过管理台（密钥登录）把核心管理员加入 `admins` 集合，之后变成白名单模式。

---

## 🔑 管理员鉴权

### 三级鉴权逻辑

```
1) key === ADMIN_KEY          → 直接通过（Web 端 + 彩蛋入口通用，始终有效）
2) openid ∈ admins 集合       → 通过（小程序彩蛋页长期鉴权）
3) admins 集合为空 / 不存在  → 默认所有人都是管理员（首次部署场景）
```

### 如何添加 / 删除管理员

| 方式 | 操作 |
|------|------|
| **Web 管理台** | 登录后用 `addAdmin` / `removeAdmin` action |
| **云开发控制台** | 直接在 `admins` 集合增删记录（字段：`openid`, `remark`） |
| **小程序彩蛋页** | 用 ADMIN_KEY 登录后调用 addAdmin / removeAdmin |

> ⚠️ `admins` 集合有 60 秒内存缓存。增删后立即生效（代码主动清缓存），但最多等 60 秒。

### 彩蛋触发
关于页连续点击版本号 **v1.0 七次** → 弹出密钥输入 → 正确后进入 `pages/admin`。

### Web 管理台使用
1. 将 `web/admin.html` 部署到云开发静态托管（或本地直接打开）
2. 输入 ADMIN_KEY 登录
3. 功能：统计面板、列表搜索（300ms 防抖）、类型筛选、展开详情、回复、标记已处理、删除、管理员增删

---

## ⚠️ 重要技术说明

### 计算器实现
微信小程序禁用 `eval` 和 `Function` 构造函数，因此内置计算器组件采用**手写递归下降 parser**，支持：
- 四则运算 `+ - * /`
- 一元负号
- 小数运算
- 严格数字格式校验（防多小数点漏洞）

### 状态推断
训练组的完成状态由 `set.done` 自动推断（`markOf` 函数），用户不需要手动选择日期状态。

### 离线同步机制
```
本地 storage 写入 → 标记待同步 → 启动 / 网络恢复触发 → store.retryAll() → 服务端幂等 upsert
```
服务端按 `(_openid, date)` 联合唯一索引保证幂等，同一天的数据整包覆盖。

---

## 📡 错误码

| 码 | 说明 |
|----|------|
| 0 | 成功 |
| 1001 | 未登录 |
| 1002 | 无权限（数据非本人） |
| 2001 | 参数错误 |
| 3001 | 保存冲突 / 服务异常 |
| 4001 | 网络异常（进入离线缓存重试） |
| 400 | 反馈参数校验失败 |
| 403 | 管理员鉴权失败 |
| 404 | 未知 action |

---

## 📋 云函数 feedback — 11 个 Action

| Action | 权限 | 说明 |
|--------|------|------|
| `submit` | 任何人 | 提交反馈 |
| `list` | 本人 | 查询我的反馈历史 |
| `listAll` | 管理员 | 查询全部反馈（支持 status/type/keyword 筛选） |
| `reply` | 管理员 | 回复反馈（自动标记 resolved） |
| `markResolved` | 管理员 | 切换处理状态（pending ↔ resolved），无回复时自动补默认回复 |
| `delete` | 管理员 | 删除反馈 |
| `stats` | 管理员 | 统计面板数据（总数 / 待处理 / 已处理 / 按类型分布） |
| `checkAdmin` | 任何人 | 检查当前身份是否管理员 |
| `listAdmins` | 管理员 | 列出当前 admins 集合 + 是否"默认开放"状态 |
| `addAdmin` | 管理员 | 新增管理员（openid + 备注） |
| `removeAdmin` | 管理员 | 移除管理员 |

---

## 📄 其他文档

| 文件 | 说明 |
|------|------|
| [user-manual/user-manual.html](user-manual/user-manual.html) | 用户操作手册 v1.1（6 章节） |
| [web/admin.html](web/admin.html) | Web 端管理台 |
| `小程序操作文档.docx` | Word 版操作文档 |

---

## 🛠 技术栈

- **前端**：微信原生小程序（WXML / WXSS / JS）
- **后端**：微信云开发（云函数 + 云数据库 NoSQL + 云存储）
- **Web SDK**：`@cloudbase/js-sdk`（管理台用 CDN 引入）
- **基础库**：2.33.0
- **AppID**：`wxd965dd25294fbdab`

---

## 📝 Commit 规范

```
feat: 新功能描述
fix: 修复描述
docs: 文档更新
```
