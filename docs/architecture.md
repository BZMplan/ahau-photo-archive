# 架构设计

## 单体全栈

页面、Route Handlers、业务服务和 SQLite 位于同一个 Next.js 项目。使用 Node.js Runtime，原生 SQLite 驱动与 Sharp 不部署到 Edge。一个应用实例配一个持久化数据卷，不增加 Redis、消息队列或独立后端。

`(public)` 和 `(dashboard)` 路由组不出现在 URL 中。优先 Server Components，仅主题 Provider、主题按钮和错误重试使用 Client Components。服务入口通过 `server-only` 防止浏览器导入；迁移脚本共享不带此标记的底层数据库连接。

页面和 API 调用 `server/services`，UI 不直接访问数据库或云凭据。数据库延迟连接，在同一进程内复用，启用 WAL、外键和 5 秒 busy timeout。迁移由 CLI 或容器启动执行，构建不依赖运行时数据库。

## 核心模块

| 模块                     | 第一阶段状态                                               |
| ------------------------ | ---------------------------------------------------------- |
| `server/db`              | Schema、连接、约束与索引已实现                             |
| `services/public-photos` | 有限数量的公开查询与显式字段投影已实现                     |
| `auth/admin`             | Better Auth 会话类型已预留，检查默认返回 `null`            |
| `storage/r2`             | 私有原图、获批衍生图、下架清理接口，调用明确抛出未实现错误 |
| `images/processor`       | Sharp 接口，不生成图片                                     |
| `security/turnstile`     | 服务端验证接口，不接受令牌或调用 Cloudflare                |
| `services/submissions`   | 投稿输入与返回类型，不保存数据                             |
| `services/moderation`    | 审核输入与管理员参数，不执行状态变更                       |

公开查询只返回 `approved` 且有展示图 Key、缩略图 Key、发布时间的记录。DTO 不包含对象 Key、联系方式、批次或管理员信息。目前按发布时间降序，最多 60 条，后续加游标分页和组合过滤。图片访问未接入，已有公开元数据也只展示明确的图片占位说明。

## 数据模型

- `submissions`：UUID、可选公开署名、可选私有联系方式、投稿时间。
- `photos`：UUID、批次、标题、描述、校园地点、拍摄日期、审核状态、三类对象 Key、MIME、大小、像素尺寸、投稿/公开/更新时间。
- `tags`：UUID、唯一名称、唯一 slug、创建时间。
- `photo_tags`：复合主键、反向标签索引，父记录删除时清理关联。
- `moderation_logs`：UUID、照片、管理员 ID、操作、前后状态、备注和时间。

照片和日志外键采用 `restrict`，避免删除批次/照片丢失历史。管理员 ID 暂为非空文本，第二阶段生成 Better Auth 表时加入关联 Migration；没有真实审核写入口。UUID 与默认时间由应用生成。

状态在 TypeScript 和数据库 CHECK 中约束。`approved` 必须有两个衍生图 Key 和发布时间。对象 Key 有唯一索引；状态与发布时间、拍摄日期、地点分别有复合索引。照片的 `submitted_at` 记录入库时间，批次字段记录整批投稿时间。

拍摄日期为可空 `YYYY-MM-DD`，不编造旧照片的时区或时刻。其他时间为 UTC Unix 毫秒，Drizzle 映射为 `Date`。日期格式、文本长度等输入规则在第二阶段服务端校验中落实。

## 目标数据流（第二阶段）

```text
匿名投稿
 → 文件大小 / MIME / 签名 / 解码像素校验
 → 服务端限流 + Turnstile Siteverify
 → 私有 R2 原图
 → SQLite transaction 写批次与 pending 照片
 → 管理员鉴权 → 私有预览 → 审核
 → Sharp 生成去 EXIF 的优化图
 → 写公开衍生图区
 → SQLite transaction 更新 approved + published_at + 审核日志
 → 公开查询 → 展示图 / 缩略图
```

R2 与 SQLite 无法原子提交。发布先确保衍生图成功，再提交数据库；失败清理孤立对象并允许重试。隐藏/拒绝要撤销公开访问并处理 CDN 缓存，不能仅改数据库状态留下公开 URL。补偿和删除顺序在实现发布服务时确定并测试。

## 存储与权限

原图和所有待审核资源始终位于私有桶；只有获批展示图/缩略图进入公开区域。审核预览使用鉴权代理或短期签名 URL。对象 Key 使用内部 UUID，不包含姓名、联系方式或原始文件名。

公开图去除 EXIF，包括地理信息；原图用于留存，默认不公开。云凭据和管理员会话仅在服务端处理，只有 Turnstile site key 可使用 `NEXT_PUBLIC_`。

静态后台不读取私有数据，暂未做登录重定向。接入业务前先加页面保护，每个 API / Server Action 再独立验证管理员角色。投稿接口目前 501，管理员接口默认 401，服务不会模拟成功。

## 部署

Next.js standalone 输出，Docker 分离安装、构建、运行，使用 Node.js 24、非 root 用户与健康检查。启动先迁移再启动应用，数据库独立挂载。当前不支持多副本共享 SQLite 或网络文件系统上的并发写入。

未来 Tunnel 连接本机或同一 Docker 网络的应用。上线前做备份/恢复演练、迁移备份、日志与容量监控、凭据配置和安全测试。

## 官方参考

初始化通过 Context7 核对 Next.js、Drizzle 与 shadcn/ui；预留服务参考官方资料：

- [Next.js App Router](https://nextjs.org/docs/app) / [自行托管](https://nextjs.org/docs/app/guides/self-hosting)
- [Drizzle Migration](https://orm.drizzle.team/docs/migrations)
- [shadcn/ui Next.js 安装](https://ui.shadcn.com/docs/installation/next)
- [Better Auth Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle)
- [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)
- [Sharp 输出处理](https://sharp.pixelplumbing.com/api-output/)
- [Turnstile 服务端验证](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
