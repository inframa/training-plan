# 健身容量记录小程序

基于微信云开发的健身训练容量记录小程序，依据《微信健身容量记录小程序详细开发设计文档 v1.0》实现。

## 功能

- **训练日历**（首页 Tab）：月历渲染、日期状态（今天/选中/已训练/草稿/未来）、标签精简展示、日期跳转与历史补录
- **每日训练记录**：动作管理、训练组录入（添加/复制上一组/批量建组/复制上次训练）、容量实时计算、座椅档位（本次修改不回写动作库，可手动同步）、保存状态三态
- **个人动作库**（Tab）：动作 CRUD、复制、归档/恢复、搜索与部位/健身房筛选、最近使用优先、图片压缩上传（最多 3 张）
- **容量计算引擎**：单组容量 = 重量 × 次数，仅已完成且数据完整的组参与；徒手/档位类不计容量并提示
- **快照机制**：当日动作保存动作信息快照，动作库编辑/归档/删除不追溯影响历史
- **数据同步**：本地优先，离线标记"待同步"，启动/网络恢复自动按日期增量推送，服务端按 (_openid, date) 幂等 upsert

## 目录结构

```
miniprogram/
  api/          接口封装（登录/动作/记录/图片）
  store/        全局状态 + 同步模块（待同步队列）
  utils/        容量计算、日期、存储、图片压缩、常量
  components/   calendar-grid / action-card / set-row / image-picker / save-status-bar
  pages/        calendar（Tab）/ actionLibrary（Tab）/ trainRecord / actionEdit / actionDetail
cloudfunctions/
  login/        换取 openid，维护 user 表
  action/       动作库 list/detail/create/update/copy/archive/delete
  record/       训练记录 save/get/month/lastAction/delete
  init/         创建业务集合（部署后执行一次）
```

## 数据表

`user` / `action` / `dailyRecord` / `dayAction` / `setRecord`，全部按 openid 隔离。

## 部署步骤

1. 微信开发者工具打开本项目（基础库 ≥ 2.30.0，已在 project.config.json 指定 2.33.0）。
2. 开通云开发并创建环境（app.js 中未指定 env，默认使用默认环境；多环境请在 `miniprogram/app.js` 填入环境 ID）。
3. 右键 `cloudfunctions` 下 `login`、`action`、`record`、`init` 四个云函数 → **上传并部署：云端安装依赖**。
4. 云开发控制台 → 云函数 → `init` → **测试**，创建 5 个集合。
5. 建议在控制台为以下集合添加索引：
   - `dailyRecord`：`_openid + date` 联合唯一索引
   - `action`：`_openid + lastUsedAt`
   - `dayAction`：`_openid + dailyRecordId`
   - `setRecord`：`_openid + dayActionId`
6. 编译运行，真机预览时注意在 app.json / 隐私协议中声明相册与相机用途。

## 错误码

0 成功；1001 未登录；1002 无权限（数据非本人）；2001 参数错误；3001 保存冲突/服务异常；4001 网络异常（进入离线缓存重试）。
