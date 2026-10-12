# 管理员审核与发布

第五阶段把匿名投稿接入管理员审核闭环。游客投稿只会产生 `pending` 照片；管理员在受保护的后台查看私有预览，逐张编辑信息并决定批准或拒绝。原图和待审核预览始终在私有存储，批准后只把 Sharp 生成的去元数据展示图和缩略图写入公开存储。

## 状态机

| 当前状态   | 允许操作             | 结果                     |
| ---------- | -------------------- | ------------------------ |
| `pending`  | 批准、拒绝、编辑信息 | `approved` 或 `rejected` |
| `approved` | 编辑信息、撤回       | `hidden`                 |
| `hidden`   | 编辑信息、恢复       | `approved`               |
| `rejected` | 编辑信息             | 保持 `rejected`          |

服务端只允许上述转换；没有通用的 `status` 修改接口，也不接受客户端提交的管理员 ID。每次状态写入使用 `WHERE id = ? AND status = expected` 的条件更新。并发请求只有一个能获得更新行，另一个返回 409；失败发布产生的公开对象会进入补偿清理。

## 后台页面和 API

`/admin/reviews` 默认按投稿时间倒序列出 pending，支持状态筛选、分页、缩略预览和待审核数量。`/admin/reviews/[id]` 展示私有预览、文件元数据、投稿信息、同批照片、编辑器和审核日志。`/admin/photos` 管理 approved/hidden/rejected/pending 列表，支持公开状态筛选与撤回/恢复。

所有 Route Handler 在读取或修改数据前调用 `requireAdmin`；写请求还检查 `Origin` 是否精确匹配 `BETTER_AUTH_URL`。接口只返回显式 DTO，私有 Object Key、原图和预览 Key、Session Token、密码哈希及联系方式不会出现在列表 DTO；详情中的联系邮箱只对已认证管理员可见。

| 方法  | 路径                              | 用途                                      |
| ----- | --------------------------------- | ----------------------------------------- |
| GET   | `/api/admin/reviews`              | 审核列表，默认 pending                    |
| GET   | `/api/admin/reviews/[id]`         | 详情、同批照片与日志                      |
| POST  | `/api/admin/reviews/[id]/approve` | pending → approved，生成公开版本          |
| POST  | `/api/admin/reviews/[id]/reject`  | pending → rejected，保存原因              |
| GET   | `/api/admin/photos`               | 管理列表                                  |
| PATCH | `/api/admin/photos/[id]`          | 编辑标题、描述、拍摄日期、地点和标签      |
| POST  | `/api/admin/photos/[id]/hide`     | approved → hidden，撤回公开对象           |
| POST  | `/api/admin/photos/[id]/restore`  | hidden → approved，生成新的公开版本       |
| GET   | `/api/admin/photos/[id]/logs`     | 审计日志                                  |
| GET   | `/api/admin/photos/[id]/preview`  | 管理员私有 WebP 预览，`private, no-store` |

成功响应为 `{ "data": ... }`；未登录 401、非管理员 403、资源不存在 404、状态冲突 409、输入错误 422、存储或 CDN 失败 503。错误消息不会包含内部堆栈、路径、凭据或对象 Key。

## 批准和恢复

`ModerationService.approvePhoto` 和 `restorePhoto` 的流程如下：

1. 查询照片并确认状态分别是 `pending` 或 `hidden`，原图 Key 必须是该 photo ID 的规范私有 Key。
2. `ImageService.publishImageVersion` 重新读取原图、生成 2000px 展示图和 600px 缩略图，使用服务器生成的 `publicationId` 写入公开桶。原图不复制、不重新压缩。
3. SQLite 事务再次执行状态条件更新，同时写入 `display_key`、`thumbnail_key`、`publication_id`、审核人、审核时间、发布时间和 `moderation_logs`。
4. 事务成功后确认 `image_operations` receipt；Next 页面缓存通过 `revalidatePath` 刷新。
5. 如果数据库事务失败，删除本次 publicationId 的两个公开对象；清理失败会留下 `cleanup_failed` 操作记录，不能返回批准成功。

如果事务已提交但 receipt 确认失败，服务会用当前 Key 条件将照片自动转为 `hidden`，写入撤回日志并清理公开对象；回滚或清理失败时只返回 503，并保留操作记录供人工恢复。

新版本 Key 形如：

```text
photos/{photoId}/{publicationId}/display.webp
photos/{photoId}/{publicationId}/thumbnail.webp
```

固定历史 Key 仍能被读取和清理，新发布不会覆盖旧版本。隐藏操作先在数据库中清除公开 Key 和 `published_at`，保证公开查询立即排除，然后幂等删除公开对象；私有原图和预览保留。恢复不重用旧 URL，而是生成新的版本。

## 拒绝、元数据和标签

拒绝只允许 pending，保存最多 1000 字符的原因，保留原图/预览以便复核；本阶段没有自动清理任务。编辑不重新上传图片，Zod 校验标题、描述、日期、locationId 和最多 20 个不重复 tagIds。地点和标签复用投稿的输入自动补全，只搜索启用目录；新增目录在地点/标签管理页完成，审核表单不再接收自由文本地点或标签。服务端事务验证 ID 存在及状态，维护 photos/location_id 与 photo_tags，同时记录名称和 ID 变化；不在审核事务中创建 tags。已有禁用关系允许原样保留，不能新增到其他照片。未传 locationId 保留历史地点；显式 null 清除，选新 ID 后关联规范地点。

`moderation_logs` 保留 `photo_id`、`admin_id`、action、前后状态、原因、时间和 `metadata_changes`。日志只追加，不提供修改或删除接口；编辑信息也写入 `edit` 日志。

## R2、SQLite 与 CDN 一致性

R2 和 SQLite 没有跨系统原子事务。`image_operations` 先记录潜在公开对象，两个对象写成功后才提交业务事务。进程中断时不要自动删除 `awaiting_commit` 对象；应先核对照片业务状态，再由维护者显式 keep/remove。单实例进程内按 photo ID 串行，数据库条件更新负责跨请求竞争。

撤回后调用 `storage/cache-invalidation.ts`，并在 `cache_purge_tasks` 中持久化受影响 URL 与状态。配置 `CLOUDFLARE_ZONE_ID` 和服务端 `CLOUDFLARE_CACHE_PURGE_TOKEN` 时只 Purge 受影响的图片 URL；未配置返回 `not_configured`，网络/API 失败返回 `failed`，两者都不会被当成 purge 成功。任务记录可供后续运维重试。Next 页面缓存、Cloudflare CDN 缓存和浏览器缓存是三层独立系统；删除 R2 对象不能保证浏览器已缓存或已下载的内容立即消失。隐私投诉需要人工按 URL 清除 CDN，并核对旧版本 URL。

## 本地验收

本地使用 `STORAGE_DRIVER=local`，不需要 R2 或 Cloudflare Token：

```bash
pnpm db:migrate
pnpm dev
```

可通过第四阶段 `/submit` 提交测试照片，管理员登录后按以下顺序验收：在 `/admin/reviews` 查看 pending 私有预览；编辑标题和标签；批准一张、拒绝一张、保留一张；确认批准照片产生公开 WebP、拒绝/待审核照片没有公开 Key；在 `/admin/photos` 撤回并恢复批准照片，检查隐藏状态、私有原图保留和新的 publicationId；在详情页检查每一步的审核日志。自动化等价场景在 `tests/moderation/moderation.test.ts` 使用临时 SQLite/LocalStorage 完成，不连接真实云服务。

生产部署前还应配置最小权限 R2 Token、验证私有桶匿名不可读、配置可选 Zone Purge Token，并执行一次隔离的失败恢复演练。管理员原图下载、批量审核、重新打开 rejected、自动清理和多副本分布式锁尚未实现。

目录管理、历史别名与审核自动补全详见 [目录指南](catalog.md)。审核详情与列表 DTO 提供选中目录 ID、名称、slug、状态，仍不暴露存储 Key；公开展示继续只允许 approved。
