# 项目开发约定

## 范围与资料

校园影像档案馆，单体 Next.js 项目，公开浏览、匿名投稿、管理员审核。已完成基础、认证、图片基础设施、匿名投稿和审核发布闭环。业务开发前读 `docs/architecture.md` 的权限边界；投稿变更读 `docs/submissions.md`；存储、发布、删除、恢复或 R2 配置变更时读 `docs/storage.md`；审核状态机和日志变更读 `docs/moderation.md`；认证/部署变更读 README，确定阶段任务时读 `docs/roadmap.md`；公开页面、筛选、排序、图片组件或 SEO 变更读 `docs/gallery.md`。

技术栈：TypeScript、pnpm、Next.js App Router、React、Tailwind CSS、shadcn/ui、SQLite、Drizzle、Better Auth、Cloudflare R2、Sharp、Cloudflare Turnstile、Docker / Docker Compose。版本以 lockfile 为准，保持单实例架构，增加基础设施先说明需求。

部署目标：在普通 Linux 服务器或其他支持 Docker 的主机上以 Docker Compose 运行 Next.js；SQLite 使用持久卷或绑定目录，图片继续使用 R2，匿名投稿继续使用 Turnstile。公网入口由项目外部的 HTTP/HTTPS 反向代理负责，代理终止 HTTPS，应用通过 HTTP 接收可信代理转发的请求；公开域名用 `BETTER_AUTH_URL` 配置，不硬编码。项目不管理反向代理或 TLS 证书，不依赖 Cloudflare Tunnel / Cloudflare Zero Trust。后续不要主动引入 cloudflared、Tunnel 配置文件、初始化脚本或容器服务。保持 Origin、Host、客户端 IP 与上传限制的安全边界。

涉及库、框架、SDK、API、CLI 或云服务的用法、配置、升级及库相关调试时，先用 Context7 `resolve-library-id`（已给精确 `/org/project` ID 可跳过），再 `query-docs` 查询对应概念。不同概念分开查，优先官方和版本匹配来源。普通重构、业务逻辑调试、代码审查和一般概念不需要。遵守工具调用次数限制，不可用时查官方文档并说明依据。

## 代码组织与 TypeScript

- `src/app` 放页面和 Route Handlers，入口保持薄；业务逻辑在 `server/services`。
- 公开页在 `(public)`，登录独立于 `admin/(dashboard)` 后台布局。
- 共享组件在 `components`，shadcn 源码在 `components/ui`；UI 工具在 `lib`，共享类型与公开 DTO 在 `types`。
- 数据库、认证、存储、处理和验证分别在 `server/db`、`auth`、`storage`、`images`、`security`。服务入口标记 `server-only`，底层数据库文件仅供服务端和迁移脚本使用。
- 优先 Server Components，只在交互边界使用 `use client`；SQLite/Sharp 使用 Node.js Runtime。
- 保持 strict，以 `unknown` 接收外部输入并校验，不使用 `any`。使用显式 DTO，避免完整数据库记录传给客户端。
- 使用 `@/*` 别名、英文标识符、snake_case 数据库字段；注释解释边界和原因，格式由 Prettier 管理。

## Migration

- 业务 Schema 在 `server/db/schema.ts`，认证 Schema 在 `auth-schema.ts`，SQL 和快照在 `drizzle/`，均提交 Git。Better Auth 升级时先官方 CLI 生成/校验认证 Schema，再生成新的 Drizzle Migration。
- 改 Schema 后 `pnpm db:generate`，审阅 SQL，再 `pnpm db:migrate` 验证。保持已应用 Migration 不变，后续改动生成新版本，不用 `push` 替代。
- 主实体 UUID，区分拍摄、投稿、发布；保持 CHECK、外键、唯一约束和索引。应用生成默认值，原生 SQL 显式提供。
- 状态和日志在同一同步事务中；保留原图及历史。认证 ID 为 UUID 文本。当前 photos 的 reviewed_by/reviewed_at/rejection_reason/publication_id 由 0004 增量迁移提供，日志 admin_id 保留文本以兼容历史，不直接重建或删除既有记录。
- 数据库在 `data/` 或 `DATABASE_PATH` 的持久化目录，生产迁移先备份。数据库、上传、密钥、构建产物不提交。

## API 与权限

- `app/api` 成功 `{ data: ... }`，失败 `{ error: { code, message } }`，使用准确状态码；未开放返回 501。
- 校验外部输入，错误不暴露堆栈、凭据和内部路径。
- 每个管理员 API / Server Action 先用 `server/auth/admin.ts` 的 `requireAdmin` 验证有效会话和当前角色，错误用 `authenticationErrorResponse`：未登录 401、无权限 403、no-store。只返回显式 DTO，不返回 Token、哈希或完整 Session。
- 后台布局与每个叶子页面取私有数据前均调用 `requireAdminPage`；登录页在保护布局外。React cache 仅请求内去重，布局、Middleware、客户端按钮状态均不能替代页面/API 鉴权。
- 投稿存储前完成文件校验、频率限制、Turnstile 服务端验证；公众无需注册。
- 匿名投稿只允许 1–5 张图片，服务端限制单张 10 MiB、批次 50 MiB、请求体 52 MiB；前端限制只是体验，不能替代服务端校验。
- `/api/submissions` 只能创建 pending；字段使用 `SubmissionService` 和 Zod 校验，照片元数据按稳定文件顺序关联，不能按文件名匹配。
- 投稿授权必须明确勾选，`consentedAt` 由服务端生成；联系邮箱不进入公开 DTO，submissionId 不是私有图片授权凭证。
- Turnstile 必须调用官方 Siteverify，校验 success、预期 hostname 和 action；生产缺 secret 时拒绝投稿，不能使用客户端标记绕过。
- 投稿限流使用服务端 SQLite 和 HMAC 来源摘要，默认保守全局桶；只有明确可信代理才能读取配置的来源头，不能信任任意 `X-Forwarded-For`。
- 公开查询复用获批且可公开条件、显式选字段；非公开详情统一按未找到处理。公开 DTO 只包含批准衍生图 URL，不含任何对象 Key、原图、预览、联系方式或审核日志。

## 审核与发布

- 所有审核 API/页面先验证 Better Auth 管理员 Session；写请求精确检查可信 Origin，不能依赖隐藏按钮或客户端状态。
- 审核状态只能通过 `server/services/moderation.ts` 的专用方法转换：`pending→approved/rejected`、`approved→hidden`、`hidden→approved`。不得提供客户端可控的通用 status 更新。
- 批准/恢复必须先由 ImageService 生成去元数据的公开版本，再以 `WHERE id AND status=expected` 条件事务写照片和 moderation log；发布失败不能标记 approved。
- 公开版本使用服务器生成的 publicationId；原图、pending/rejected/hidden 资源不能写入公开桶。撤回先移出公开查询，再幂等删除公开对象，保留私有原图。
- `moderation_logs` 只追加，记录操作人、前后状态、原因、时间和元数据变更；不可写入 Token、密码、R2 凭据、二进制或不必要联系方式。
- SQLite 与 R2 没有跨系统原子事务；image_operations receipt、失败补偿和 cleanup_failed 记录必须保留。不能自动删除可能已提交的 awaiting_commit 对象。
- Next 页面缓存刷新与 Cloudflare CDN purge 分开处理。未配置/失败的 purge 必须显式报告，不能声称 R2 删除立即清除全网缓存。
- 撤回产生的 CDN purge 结果写入 `cache_purge_tasks`；失败任务不得静默丢弃，后续重试应按记录的 URL 执行。

## 公开展示

- 公开查询统一经 services/public-photos，共用 approved 与完整公开资源条件；DTO 字段白名单，禁止输出私有 Key、投稿联系方式、审核历史或管理员信息。
- 页面仅使用 storage/urls 生成的批准衍生图 URL，不读取私有原图；thumbnail 用于照片墙、display 用于详情，保留宽高比与失败占位。
- 列表分页有上限，筛选/排序在 SQL 执行，时间排序附加唯一 ID；takenAt 为日历日期，空日期不归入年份/季节。地点复用 normalizeLocation。
- 公开页动态查询，撤回后新请求列表排除且详情 404；Next revalidatePath 与 CDN purge 分开验证，不缓存过期审核状态。
- 正式页面只展示真实批准照片，无数据用空状态；保持服务端组件为主，新增复杂前端依赖前说明必要性。

## 管理员认证

- Better Auth 负责密码哈希、Cookie 和 Session；公开注册关闭。Admin Plugin 默认 user，只有精确 admin、未禁用且非模拟会话能进入后台。Cookie 权限缓存保持关闭。
- HTTP 认证白名单在 `auth/http.ts`，管理员创建、角色修改等保持服务端专用。扩展白名单前评估权限、CSRF 和返回字段，保持普通用户无法获得管理员权限。
- 首个管理员只通过可信本地 TTY 的 `pnpm admin:init`，检查已有管理员后委托官方 CLI 安全输入密码；无默认密码、公开初始化 API 或启动自动创建。
- 认证配置由 `auth/environment.ts` 校验；密钥随机至少 32 字符，URL 为固定 origin。外部 HTTPS 开启 Secure，只有 loopback 可 HTTP；来源精确匹配，不信任任意代理来源/IP。
- SQLite 持久化认证限流当前使用共享 per-path 桶。改为 IP 限流前必须证明入口不可绕过且头可信，不关闭 CSRF/Origin 校验。
- Drizzle auth adapter 不启用 async transaction；better-sqlite3 事务回调为同步。测试账号只创建于独立临时数据库，禁止向开发或生产库填入测试账号。

## 图片与隐私

- 原图和待审核资源始终私有，原图保留原字节、不可公开访问；待审核图片不能进入公开 Bucket。公开桶只写管理员授权的去元数据衍生图，公开 DTO 不含对象 Key 和联系方式。
- 图片输入必须服务器验证实际编码、大小、像素和完整解码；统一用 `ImageService`，对象操作统一经 `ObjectStorage` Adapter，参数集中于 images/config.ts。不能直接公开复制原图或相信浏览器 MIME/扩展名。
- Key 只由服务器规范生成 UUID 路径，原图扩展名匹配编码，不能使用用户文件名或请求任意 Key。数据库复用 byte_size，preview_key 私有；只存 Key，不存带签名的临时 URL。
- 私有图片 API 先 requireAdmin 再查 photoId/匹配 Key，no-store，401/403/404；禁止直接静态服务私有目录。local 公开路由还要验证 approved，防路径/符号链接穿越；不开放游客上传、发布或删除接口。
- 发布必须按 storage.md 协议：写入持久操作记录，两个公开文件成功后业务事务才能 approved；提交后确认 receipt，失败补偿。image_operations 中断/清理失败可追踪，恢复先核对业务状态，不能自动删除可能已提交的对象。
- 撤回只清公开图、保留原图；永久删除仍保留业务历史。删除幂等，隐藏/拒绝需按配置处理 CDN purge；不能宣称 R2 删除等于即时全网撤回。
- local/r2 显式切换，生产缺 R2 配置要失败、不能静默回退；密钥只读服务端环境、禁止硬编码。测试用临时目录/数据库和 SDK mock，不连接真实云或填入开发/生产测试照片。
- 未接入功能不调用真实 Cloudflare API、不模拟成功。凭据在服务端环境变量，`.env.example` 只含空值及非敏感示例，秘密不使用 `NEXT_PUBLIC_`。
- 批量投稿先写 `submission_operations`，逐张保存私有原图/预览；SQLite 提交成功后才返回 201，任一失败都必须补偿清理，清理失败要保留 operation 记录供排查。
- 不把 pending 图片、原图或预览写入公开 Bucket；投稿流程不得调用 `publishImage`，公开 Key、签名 URL 和存储凭据不能返回游客。
- 审核预览必须先 `requireAdmin`，通过 photoId 查询数据库后读取私有 preview_key；管理员 API 不接受任意对象 Key。

## 完成检查

提交前 `pnpm check` 和 `pnpm build`（check 含 Vitest）；数据库变更验证首次、重复与旧库升级，`pnpm db:compile`。认证、图片或投稿路由变更在 build 后运行 `pnpm test:auth-flow`。存储变更覆盖发布失败/清理失败/重启恢复、原图不变、方向/元数据、路径隔离与权限；投稿变更覆盖单/多图、字段错位、Turnstile、限流、幂等、失败清理、pending 与无公开对象。确认 standalone 未追踪数据/环境/测试文件。保留未实现功能明确的拒绝行为，报告未执行的真实云/浏览器检查。

更新中文文档，报告通过和未能执行的检查。审阅 staged diff，确认没有数据库、密钥、上传或构建产物；任务未要求时不建远程仓库或推送。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
