# 项目开发约定

## 范围与资料

校园影像档案馆，单体 Next.js 项目，公开浏览、匿名投稿、管理员审核。已完成基础与管理员认证；投稿、图片和审核仍为骨架，未实现交互要标注并禁用。业务开发前读 `docs/architecture.md` 的数据流与权限边界；变更认证或部署时先读 README 的初始化与环境说明，确定阶段任务时读 `docs/roadmap.md`。

技术栈：TypeScript、pnpm、Next.js App Router、React、Tailwind CSS、shadcn/ui、SQLite、Drizzle、Better Auth、R2、Sharp、Turnstile、Docker。版本以 lockfile 为准，保持单实例架构，增加基础设施先说明需求。

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
- 状态和日志在同一同步事务中；保留原图及历史。认证 ID 为 UUID 文本。当前 photos 无 reviewed_by，日志 admin_id 无用户外键；后续关联先评估已有记录，用新增量迁移添加，保留历史。
- 数据库在 `data/` 或 `DATABASE_PATH` 的持久化目录，生产迁移先备份。数据库、上传、密钥、构建产物不提交。

## API 与权限

- `app/api` 成功 `{ data: ... }`，失败 `{ error: { code, message } }`，使用准确状态码；未开放返回 501。
- 校验外部输入，错误不暴露堆栈、凭据和内部路径。
- 每个管理员 API / Server Action 先用 `server/auth/admin.ts` 的 `requireAdmin` 验证有效会话和当前角色，错误用 `authenticationErrorResponse`：未登录 401、无权限 403、no-store。只返回显式 DTO，不返回 Token、哈希或完整 Session。
- 后台布局与每个叶子页面取私有数据前均调用 `requireAdminPage`；登录页在保护布局外。React cache 仅请求内去重，布局、Middleware、客户端按钮状态均不能替代页面/API 鉴权。
- 投稿存储前完成文件校验、频率限制、Turnstile 服务端验证；公众无需注册。
- 公开查询复用获批且可公开条件、显式选字段；非公开详情统一按未找到处理。

## 管理员认证

- Better Auth 负责密码哈希、Cookie 和 Session；公开注册关闭。Admin Plugin 默认 user，只有精确 admin、未禁用且非模拟会话能进入后台。Cookie 权限缓存保持关闭。
- HTTP 认证白名单在 `auth/http.ts`，管理员创建、角色修改等保持服务端专用。扩展白名单前评估权限、CSRF 和返回字段，保持普通用户无法获得管理员权限。
- 首个管理员只通过可信本地 TTY 的 `pnpm admin:init`，检查已有管理员后委托官方 CLI 安全输入密码；无默认密码、公开初始化 API 或启动自动创建。
- 认证配置由 `auth/environment.ts` 校验；密钥随机至少 32 字符，URL 为固定 origin。外部 HTTPS 开启 Secure，只有 loopback 可 HTTP；来源精确匹配，不信任任意代理来源/IP。
- SQLite 持久化认证限流当前使用共享 per-path 桶。改为 IP 限流前必须证明入口不可绕过且头可信，不关闭 CSRF/Origin 校验。
- Drizzle auth adapter 不启用 async transaction；better-sqlite3 事务回调为同步。测试账号只创建于独立临时数据库，禁止向开发或生产库填入测试账号。

## 图片与隐私

- 原图和待审核资源始终私有，原图默认不公开。
- 只有获批照片生成并发布展示图/缩略图，公开图去 EXIF；公开 DTO 不含对象 Key 和联系方式。
- 审核预览鉴权，短期签名 URL 不记日志或长期保存；Key 用内部 UUID。
- 隐藏/拒绝撤销公开访问及 CDN 缓存；跨 SQLite/R2 写入设计补偿与幂等重试。
- 未接入功能不调用真实 Cloudflare API、不模拟成功。凭据在服务端环境变量，`.env.example` 只含空值及非敏感示例，秘密不使用 `NEXT_PUBLIC_`。

## 完成检查

提交前 `pnpm check` 和 `pnpm build`；数据库变更还验证首次、重复与旧库升级，Docker 迁移脚本通过 `pnpm db:compile`。认证改动在 build 后运行 `pnpm test:auth-flow`，覆盖真实后台路由、登录/退出、401/403和过期。按改动验证隐私隔离、错误状态、响应式布局和主题。保留未实现功能明确的禁用/拒绝行为。

更新中文文档，报告通过和未能执行的检查。审阅 staged diff，确认没有数据库、密钥、上传或构建产物；任务未要求时不建远程仓库或推送。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
