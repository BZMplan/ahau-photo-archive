# 架构设计

## 单体全栈与模块

Next.js App Router、Route Handlers、服务和 SQLite 在同一 Node.js 实例运行。SQLite / Sharp 不部署到 Edge；单实例配独立持久化卷，不引入 Redis 或队列。SQLite 延迟连接、进程复用，启用 WAL、外键与 5 秒 busy timeout。构建不连接运行数据库，CLI / 容器启动负责迁移。

页面/API 保持薄，业务在 `server/services`，认证在 `server/auth`。入口以 `server-only` 阻止浏览器导入；`auth/options.ts`、`auth/environment.ts` 和底层数据库支持可信 CLI / 测试。Client Components 限于主题、登录、退出和错误重试；不会将数据库连接、哈希或认证 Token 传入客户端。

| 模块                                                   | 状态                                 |
| ------------------------------------------------------ | ------------------------------------ |
| `server/db`                                            | 业务表、认证表、连接与增量 Migration |
| `services/public-photos`                               | 只读获批且完整可公开的记录，显式 DTO |
| `auth/options` / `auth/index`                          | Better Auth 1.7.7 配置 / 服务端实例  |
| `auth/admin` / `auth/pages`                            | 会话与角色检查 / 页面跳转            |
| `auth/http`                                            | HTTP 认证接口白名单与敏感字段过滤    |
| `auth/cli` / `scripts/admin-init`                      | 官方 CLI 配置与安全初始化包装        |
| `storage/r2`、`images/processor`、`security/turnstile` | 仅预留接口，明确抛出未实现错误       |
| `services/submissions`、`services/moderation`          | 仅预留业务接口，不写入数据           |

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

业务表保持原样：`submissions`、`photos`、`tags`、`photo_tags`、`moderation_logs`。照片 pending / approved / rejected / hidden 的 CHECK、公开衍生图约束、索引与外键不变。拍摄日期可空 YYYY-MM-DD，投稿/发布时间等为 UTC 毫秒。公开查询只选 approved 且衍生图与发布时间完整的记录，最多 60 条；不返回原图 Key、联系方式或管理员信息。

新增认证表基于 1.7.7 官方 CLI 生成，并经 Drizzle Migration：

- `user`：UUID 文本 ID、邮箱唯一、姓名与验证标志、Admin Plugin 的 role / banned / banReason / banExpires。
- `session`：UUID、唯一 Token、过期、用户外键及索引、IP/User-Agent、impersonatedBy。
- `account`：用户外键与索引、credential 密码哈希及标准 provider/token 字段。
- `verification`：标识、验证值、过期与索引，为 Better Auth 标准表，暂不开放邮件验证业务。
- `rate_limit`：唯一请求桶 Key、次数与最后请求时间。

新 `0001` 只 CREATE 认证表/索引，保留 `0000` 和全部业务数据；不重建业务表。当前实际 `photos` **没有 `reviewed_by` 字段**，日志 `admin_id` 为 UUID 兼容的文本但没有用户外键。认证 ID 使用 UUID 文本，与未来审核关联兼容。后续审核阶段用新的增量迁移添加可空 `photos.reviewed_by` 外键，并先评估历史日志再建立用户关联，不能强行破坏历史记录。本阶段没有审核写入口。

## 后续图片流与隐私

匿名投稿 → 文件大小/MIME/签名/像素验证 → 单实例限流和 Turnstile → 私有 R2 原图 → SQLite 批次与 pending → 管理员私有预览/审核 → Sharp 去 EXIF → 获批衍生图 → SQLite 发布状态与审核日志 → 公开查询。

原图和待审核图片始终私有；仅获批展示图/缩略图可进入公开区。审核 URL 短期签名且鉴权，Key 用 UUID，不含联系方式。隐藏/拒绝需撤销公开资源与 CDN 缓存，不能只改数据库。R2 和 SQLite 无原子事务，发布与清理需要补偿、幂等和重试测试。

## 部署

Next.js standalone、Docker Node.js 24、非 root、启动先迁移、SQLite 持久化。认证密钥只在运行时传入，不能进入镜像。未来 Tunnel 外部 HTTPS origin 配置到 BETTER_AUTH_URL，浏览器使用该域名，应用入口保持私有，不开放任意来源。备份恢复、监控、可信代理与防护上线前验证。不支持多副本共享 SQLite。

## 官方参考

本阶段先通过 Context7 核对 Better Auth，再用对应官方文档与已安装 1.7.7 源码验证 API、CLI 和安全行为。

- [Better Auth Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle)
- [Admin Plugin](https://better-auth.com/docs/plugins/admin)
- [官方 CLI](https://better-auth.com/docs/concepts/cli)
- [Rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Cookies](https://better-auth.com/docs/concepts/cookies)
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
