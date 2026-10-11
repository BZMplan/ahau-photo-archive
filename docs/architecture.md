# 架构设计

## 单体全栈与模块

Next.js App Router、Route Handlers、服务和 SQLite 在同一 Node.js 实例运行。SQLite / Sharp 不部署到 Edge；单实例配独立持久化卷，不引入 Redis 或队列。SQLite 延迟连接、进程复用，启用 WAL、外键与 5 秒 busy timeout。构建不连接运行数据库；部署者在应用启动前显式运行迁移命令。

## 部署拓扑与职责

```text
Internet
    |
    v
HTTP/HTTPS Reverse Proxy（项目外部，终止 HTTPS）
    |
    v HTTP
Next.js Application（Docker / Docker Compose，单实例）
    +---- SQLite Database（Docker Volume 或绑定目录）
    +---- Cloudflare R2（私有原图、获批公开衍生图）
    +---- Cloudflare Turnstile（匿名投稿 Siteverify）
```

Next.js 容器提供 HTTP 应用与健康检查，部署者在启动前显式执行数据库 Migration，应用运行时访问 R2 和 Turnstile；容器不管理 TLS 证书。外部反向代理由部署者选择、配置和维护，负责公网 HTTP/HTTPS 入口、TLS 终止、转发、上传请求体限制与 HTTP 超时；项目不提供代理配置或代理容器。应用端口只允许可信代理访问，Compose 默认绑定主机 loopback。部署可运行在普通 Linux 服务器或其他支持 Docker 的主机，不依赖 Cloudflare Tunnel 或 Cloudflare Zero Trust。

页面/API 保持薄，业务在 `server/services`，认证在 `server/auth`。入口以 `server-only` 阻止浏览器导入；`auth/options.ts`、`auth/environment.ts` 和底层数据库支持可信 CLI / 测试。Client Components 限于主题、登录、退出和错误重试；不会将数据库连接、哈希或认证 Token 传入客户端。

| 模块                                            | 状态                                                |
| ----------------------------------------------- | --------------------------------------------------- |
| `server/db`                                     | 业务表、认证表、连接与增量 Migration                |
| `services/public-photos`                        | 只读获批且完整可公开的记录，显式 DTO                |
| `auth/options` / `auth/index`                   | Better Auth 1.7.7 配置 / 服务端实例                 |
| `auth/admin` / `auth/pages`                     | 会话与角色检查 / 页面跳转                           |
| `auth/http`                                     | HTTP 认证接口白名单与敏感字段过滤                   |
| `auth/cli` / `scripts/admin-init`               | 官方 CLI 配置与安全初始化包装                       |
| `storage` / `images` / `services/image-service` | 隔离 Adapter、格式验证、Sharp、发布/撤回及恢复日志  |
| `security/turnstile`                            | Siteverify 服务端验证、hostname/action 校验         |
| `security/submission`                           | Origin 检查、HMAC 来源桶                            |
| `services/submissions`                          | 批量私有保存、限流、幂等、数据库事务与补偿          |
| `services/moderation`                           | 状态机、发布补偿、元数据/标签和审计日志事务         |
| `storage/cache-invalidation`                    | 可选 Cloudflare URL 级缓存清除，显式报告未配置/失败 |

## 认证架构与数据流

```text
本地可信 TTY：pnpm admin:init
 → 配置校验 → 检查已有管理员
 → 官方 auth create-admin 遮蔽密码输入
 → 服务端 Admin Plugin createUser + Better Auth 密码哈希
 → user(role=admin) + account(credential)

浏览器 /admin/login
 → 同源 POST /api/auth/sign-in/email
 → Better Auth 输入校验、CSRF / Origin / callback 校验、SQLite 限流
 → 验证密码 → 创建 session → HttpOnly Cookie
 → 客户端 GET /api/admin/me 再确认权限
 → 固定导航 /admin

页面/API 请求带 Cookie
 → Better Auth 验证签名、过期并读取 SQLite
 → 检查 role=admin、未被禁用、不是模拟会话
 → 页面未登录跳转；非管理员回登录页显示拒绝信息
 → API 未登录 401 / 非管理员 403 / 管理员 DTO

退出 POST /api/auth/sign-out
 → Better Auth 删除 Session 并清 Cookie
 → 固定导航 /admin/login
```

不开放公开注册，不提供管理员初始化 HTTP API，不在启动时创建账号。Admin Plugin 默认角色为 `user`，应用只认可精确 `admin`。仅可信服务端 CLI 允许 `createUser`；HTTP 包装层不开放 Admin Plugin 的任何用户/角色变更端点。客户端伪造 `role`、Token 或请求参数不会替代数据库判断。

Session 7 天有效、24 小时更新周期、freshAge 1 小时。Cookie Cache 关闭，权限即时读取当前数据库；页面检查禁用自动刷新，避免 Server Component 写 Cookie。Better Auth 的公开会话接口保留正常更新机制。过期会话无法复活，退出后旧 Cookie 无效。

`admin/login` 在保护布局之外，URL 保持不变。`admin/(dashboard)/layout` 与每个叶子页面都调用 `requireAdminPage()`；React `cache` 只在当前服务端渲染内去重。不能依赖布局永远重新执行，也不能仅依赖客户端或 Middleware。未来页面取私有数据前继续调用保护函数。

每个 `/api/admin/*` 必须调用 `requireAdmin(request.headers)`，捕获 `AuthenticationError` 交给 `authenticationErrorResponse`；未登录 401、无权限 403、响应 no-store。Server Actions 同样单独鉴权。`GET /api/admin/me` 仅返回 id / name / email / role。完整 Session 仅留在服务器；登录和会话 HTTP 响应也去掉 Token 等敏感认证数据。

## Cookie、来源与限流

运行时必须提供随机 `BETTER_AUTH_SECRET`（至少 32 字符）和固定 `BETTER_AUTH_URL`。后者只接受无路径、无凭据、无 query/hash 的 origin；生产外部地址必须 HTTPS，仅 loopback 允许本地 HTTP。启动校验，构建阶段无需密钥。

`trustedOrigins` 精确等于该 origin；不从任意请求 Host / 转发头推断认证域名，`trustedProxyHeaders=false`。Cookie host-only、HttpOnly、SameSite=Lax，HTTPS 启用 Secure；不关闭 Better Auth 内建 CSRF / Origin / 回调防开放重定向检查。登录成功和退出的前端目的地固定，无回跳参数。

认证限流启用且存 SQLite `rate_limit`，登录共享 10 次/60 秒，其他认证请求共享 100 次/60 秒。`ipAddressHeaders=[]` 刻意不信任客户端代理头，Better Auth 使用共享 per-path 桶并提示无法确定客户端 IP。单实例重启不清额度；当前低流量管理用途接受共享额度。部署经身份可验证且不可绕过的入口后再设计可信 IP 与清理过期计数，不能简单信任任意 `CF-Connecting-IP` / `X-Forwarded-For`。

Drizzle Adapter 使用 SQLite，未启用异步 adapter transaction：better-sqlite3 的事务回调是同步的，不能包裹 Better Auth 的 async 回调。不自行实现哈希、Token 或 Cookie；认证数据库操作使用官方 adapter。业务审核将来仍在同步 Drizzle 事务中写状态与日志。

## 数据模型与兼容性

业务表基础结构保留，增量增加 photos.preview_key、image_operations、投稿字段及 `submission_operations` / `submission_rate_limits`：`submissions`、`photos`、`tags`、`photo_tags`、`moderation_logs`。照片 pending / approved / rejected / hidden 的 CHECK、公开衍生图约束、索引与外键不变。投稿署名、联系邮箱、备注、授权时间和客户端幂等 request_id 仅服务端保存；拍摄日期可空 YYYY-MM-DD，投稿/发布时间等为 UTC 毫秒。公开查询只选 approved 且衍生图与发布时间完整的记录，默认每页 24 条、上限 60 条；不返回原图 Key、联系方式或管理员信息。

新增认证表基于 1.7.7 官方 CLI 生成，并经 Drizzle Migration：

- `user`：UUID 文本 ID、邮箱唯一、姓名与验证标志、Admin Plugin 的 role / banned / banReason / banExpires。
- `session`：UUID、唯一 Token、过期、用户外键及索引、IP/User-Agent、impersonatedBy。
- `account`：用户外键与索引、credential 密码哈希及标准 provider/token 字段。
- `verification`：标识、验证值、过期与索引，为 Better Auth 标准表，暂不开放邮件验证业务。
- `rate_limit`：唯一请求桶 Key、次数与最后请求时间。
- `submission_operations`：匿名批次的 writing / failed / cleanup_failed / complete、请求 ID 和待清理私有对象；用于文件失败补偿，不代表照片已审核。
- `submission_rate_limits`：HMAC 来源的小时投稿数、日照片数和窗口时间；不保存原始 IP。

新 `0001` 只 CREATE 认证表/索引，后续迁移均保留历史数据。`0004` 为 photos 增加可空 `publication_id`、`reviewed_by`、`reviewed_at`、`rejection_reason`，为 moderation_logs 增加 JSON `metadata_changes`；`0005` 增加轻量 `cache_purge_tasks` 记录撤回后的 CDN 清理状态。日志 `admin_id` 保留文本以兼容历史记录。`publication_id` 与公开 Key 的版本 UUID 一一对应，隐藏时清空当前公开 Key，原图仍保留。认证 ID 使用 UUID 文本，不把会话 Token 或密码写入业务日志。

## 图片基础设施与隐私

现有 server/storage 和 server/images 已实现，lib 保持客户端工具用途，凭据与文件 IO 不进入浏览器。统一 ObjectStorage 的固定 scope 包含 put/get/head/delete/exists；local 根目录独立于 Next 静态 public，R2 两桶共享一个 S3Client。服务入口都有 server-only。配置只在服务器读取，开发默认 local，生产未设置 driver 默认 r2，缺凭据拒绝启动，不静默回退。

Key 为 UUID + originals/previews/photos 的白名单布局；新公开版本使用 `photos/{photoId}/{publicationId}/display.webp` 和 `thumbnail.webp`，兼容历史固定 Key，不由客户端指定版本。原图扩展名匹配实际编码，私有/公开前缀不混用。LocalStorage 原子文件写入与条件创建，检查 Key、真实路径和符号链接；R2 条件写入、有限重试、下载大小上限、类型安全错误。不提供游客写存储的 HTTP 入口。

Sharp 验证签名、格式、10 MiB、24MP/16000px、安全完整解码；处理并发 2、队列最多 8。原图保存原始字节；私有预览 1200px，展示 2000px，缩略 600px，全为 WebP、保持比例、不放大、autoOrient、移除 EXIF/GPS。基础元数据只返回编码尺寸、格式/MIME、大小和可空 orientation，不解析摄影 EXIF，不覆盖日期。参数统一配置。

新增 preview_key（可空、唯一）复用原有 byte_size（没有另建 file_size）。image_operations 保存操作 UUID、photoId、action、state、scope/Key JSON、errorCode、时间及状态索引，不挂照片外键，允许业务记录建立前的文件恢复。0002 只新增表/索引及 ALTER ADD，不删除业务表或修改 0000/0001。

ImageService 不更新照片业务状态。publishImage 验证真实管理员后生成衍生图，再次鉴权，记录 writing 后条件写入，成功返回 awaiting_commit receipt。未来业务层此时事务提交 approved/Key/时间/日志，成功 confirmPublication，失败 recoverOperation(remove)。上传失败清理本次所有可能新建的对象；清理失败持久化 cleanup_failed，保留安全可追踪日志。固定 Key + hash 复用相同内容，冲突不覆盖旧公开资源；同 UUID 单进程串行。complete 也可表示补偿已完成，需结合 action/errorCode 判断，不能当作照片获批状态。

进程中断后 writing/awaiting_commit 必须先检查业务数据库，再显式 keep/remove，不能自动删除可能已提交的图。R2 文件写入与 SQLite 无原子提交，授权上传至业务提交之间存在短暂可见窗口，本阶段只提供底层协议；本地只读路由额外校验数据库 approved。完整恢复和运维契约见 [storage.md](storage.md)。

GET /api/admin/photos/[id]/preview 先 requireAdmin 再查照片匹配的私有 preview_key，返回 WebP、private no-store、Vary Cookie；未登录 401、非管理员 403、无预览 404。GET /api/images/[...key] 仅 local，严格 public Key 和数据库 approved 条件；R2 URL 从固定 HTTPS 自定义 origin 生成。原图/待审核图片不使用公开 URL。

unpublish 仅删公开图，delete 清全部文件，均幂等、不改业务表。审核服务先以条件事务将照片移出 approved，再删除公开版本；可选 `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_CACHE_PURGE_TOKEN` 时按 URL 清除 CDN，未配置或失败会明确返回状态，绝不宣称删除对象等于全网缓存消失。

## 审核与发布数据流

```text
管理员 Session + 同源状态请求
 → ModerationService 条件检查 pending/approved/hidden
 → approve/restore：ImageService 读取私有原图，生成去元数据 WebP
 → 公开桶写入不可预测 publicationId 版本，image_operations 保存 receipt
 → SQLite 同步事务条件更新状态、公开 Key、审核人/时间并写 moderation_logs
 → 确认 receipt，刷新 Next 页面缓存；失败补偿删除本次公开对象
```

`pending → approved`、`pending → rejected`、`approved → hidden`、`hidden → approved` 是唯一开放的状态转换。每次更新都带旧状态条件；两个管理员竞争时只有一个事务返回更新行数，失败方得到 409。拒绝不写公开桶，隐藏清空公开字段但保留私有原图。标签在元数据事务中规范化、去重并写入 `tags/photo_tags`，编辑操作也生成审计日志。

Next `revalidatePath` 只处理应用页面/数据缓存；对象删除和可选 Cloudflare URL purge 分开报告。浏览器已经缓存或下载的副本无法由应用收回。

## 匿名投稿数据流

```text
同源游客 /submit
 → 浏览器选择 1–5 个 File，生成 object URL，仅本地预览
 → 逐张填写标题、描述、拍摄日期、地点和批次署名
 → 勾选版权/隐私/审核授权 + Turnstile
 → POST multipart /api/submissions
 → Origin、Content-Length、字段、文件数量/总量、Zod 重新验证
 → Siteverify 校验 success + 预期 hostname + action=submit
 → HMAC 来源检查 SQLite 小时/日限额
 → ImageService 顺序保存原图 private，并生成 private preview
 → SQLite 事务创建 1 条 submission + 1–5 条 pending photos
 → 事务成功返回 submissionId / photoCount / pending
```

Route Handler 只做请求解析和错误映射；`SubmissionService` 负责流程。提交记录同时填充新字段和旧 `attribution/contact` 兼容字段，`consentedAt` 由服务端生成。`photos.displayKey`、`thumbnailKey`、`publishedAt` 始终为 NULL，任何匿名请求都没有发布能力。

对象存储和 SQLite 没有跨系统事务。`submission_operations` 在第一份文件写入前建立，随着每张照片写入记录私有原图/预览 Key；完整数据库事务成功才标记 complete。任何验证、存储或数据库错误都会按记录清理已写对象；清理失败标记 cleanup_failed 并记录无敏感内容的 operationId，供后续人工排查。失败清理成功的 requestId 可安全重试，已完成 requestId 返回同一受理结果，不重复建立批次。

投稿请求默认使用全局保守限流桶；只有在可信反向代理已剥离外部伪造头并显式设置 `TRUSTED_PROXY_IP_HEADER` 时，才按该头的 HMAC 摘要分桶。`RATE_LIMIT_SECRET` 优先，否则本地回退 `BETTER_AUTH_SECRET`；每小时最多 3 次成功批次，每天最多 15 张照片，计数在最终 SQLite 事务中增加。限流不依赖 localStorage，不记录原始 IP。

`/api/submissions` 只接受同源 `Origin`（缺少 Origin 的非浏览器请求仍可进入服务端校验），无 CORS 通配。请求体 Content-Length 上限 52 MiB，图片总字节上限 50 MiB，单张 10 MiB；解析后仍检查实际 File 大小。外部反向代理应设置与 52 MiB 投稿请求上限兼容的 body limit，不能把 Content-Length 当作唯一安全边界。

完整字段、错误状态、Turnstile 和本地测试见 [submissions.md](submissions.md)。

## 部署

生产支持 Docker Compose 与原生 Linux systemd 两种单实例方式，均运行同一个 Next.js standalone `node server.js`，共用业务服务、Drizzle SQL、运行时环境变量和 SQLite Backup API。Docker 镜像使用多阶段 Debian slim / Node.js 24；Compose 将 SQLite 主文件、WAL、SHM 与可选 local 图片放在 `/app/data` 持久卷，备份放独立卷。原生方式把代码按版本放在 `/opt/ahau-photo-archive/releases`，数据放在 `/var/lib/ahau-photo-archive`，备份放在 `/var/backups/ahau-photo-archive`，由低权限 systemd 服务监听回环地址。两种方式认证与 R2 密钥只在运行时传入。Migration 由一次性命令显式执行，启动前只读核对已应用版本，再执行 `node server.js`；应用重启不自动迁移或重建数据库。恢复须停应用并显式确认；镜像或 symlink 回滚都不等于 Schema 回滚。不支持多副本共享 SQLite。详见 [Docker 指南](deployment.md)与[原生指南](deployment-native.md)。

`BETTER_AUTH_URL` 配置为浏览器实际访问的固定 HTTPS origin，不从请求的 Host 或转发头动态生成；它同时供 Better Auth 的 `baseURL` / 精确 `trustedOrigins`、Turnstile 生产 hostname 校验，以及 Next.js 的公开 metadata、sitemap 和 robots URL 使用。HTTPS 在外部代理终止，代理以 HTTP 请求应用；Better Auth 仍根据公开 HTTPS URL 设置 Secure、HttpOnly、SameSite=Lax、host-only Cookie。生产 Turnstile Widget 须绑定同一公开域名，并在 Siteverify 校验 hostname 和 action。投稿页面动态读取运行时 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 并作为公开 prop 传给客户端；Secret Key 仍只在服务端运行时读取，同一镜像可用于不同公开域名。代理需限制允许的 Host，应用继续精确校验 Origin、拒绝跨域管理员写请求，不关闭 CSRF/Origin 校验来适配代理。

默认不信任 `X-Forwarded-For` 或其他客户端自带 IP 头；投稿限流维持保守全局桶，认证限流维持共享 per-path 桶。只有代理入口不可绕过、代理清除用户提供的同名头并重写为可信客户端 IP，且显式配置 `TRUSTED_PROXY_IP_HEADER` 后，投稿才可按该头分桶；不能把这一设置误认为认证限流已改为 IP 分桶。代理应转发正常的 Host / Origin 信息，同时确保请求到达应用前不能由攻击者任意伪造可信来源。设置与 52 MiB 投稿上限兼容的请求体限制，并为上传、图片处理及正常响应配置合理的读取、转发和空闲超时；具体数值按部署环境压测确定。应用层继续校验请求与图片大小、来源及管理员权限，代理规则不能替代这些检查。备份恢复、监控与 CDN 缓存清理由各自的运维流程验证。

## 官方参考

本阶段先通过 Context7 核对 Better Auth，再用对应官方文档与已安装 1.7.7 源码验证 API、CLI 和安全行为。

- [Better Auth Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle)
- [Admin Plugin](https://better-auth.com/docs/plugins/admin)
- [官方 CLI](https://better-auth.com/docs/concepts/cli)
- [Rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Cookies](https://better-auth.com/docs/concepts/cookies)
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)

## 第六阶段公开展示

公开页、Metadata、筛选项与 sitemap 的照片读取统一通过 services/public-photos。SQL 分页/排序/组合筛选和白名单 DTO；标签批量关联，地点用连接注册的确定性 normalize_location 函数统一历史文本。已有索引足够，不新增 Migration。公开页 force-dynamic，仅 React cache 请求内去重；审核 revalidatePath 覆盖档案/详情/标签/sitemap，与 Cloudflare purge 分开。next/image unoptimized 直接读取既有公开 WebP，网格保留比例，客户端边界仅图片加载状态与原生 dialog。详见 [公开影像指南](gallery.md)。
