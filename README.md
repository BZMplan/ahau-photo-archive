# AHAU Photo Archive

轻量的校园影像档案馆，长期整理校园建筑、自然风景、四季变化、校园生活和历史影像。一个 Next.js 全栈项目，公开浏览无需登录，支持匿名投稿和管理员审核。

当前支持两种并列的单实例生产部署：**[Docker Compose](docs/deployment.md)** 和 **[原生 Node.js Standalone + systemd](docs/deployment-native.md)**。两种方式共用自动初始化、持久化 SQLite、Drizzle Migration、图片服务与在线备份；原生方式运行网站无需 Docker 或 pnpm。正式代理、R2 权限和浏览器验收仍由部署者在目标环境完成。公开影像设计见 [公开影像指南](docs/gallery.md)。

第五阶段审核发布能力继续保留。在第四阶段匿名投稿基础上，支持管理员审核队列、私有预览、元数据/标签编辑、批准/拒绝、版本化公开衍生图、撤回/恢复、并发状态保护、审核日志、真实状态统计和可选 Cloudflare URL 级缓存清除。新投稿仍先进入 `pending`，原图永远保持私有。

## 前台浏览

AHAU 是 Anhui Agricultural University（安徽农业大学）的完整英文缩写，品牌保持不可拆分。
首页 `/` 为全屏文字开场：学校名称、简短介绍、浏览影像档案与投稿入口；不查询、展示或预取照片列表，也没有照片背景。
所有公开照片以 `/archive` 为主要入口：全宽 CSS Columns 瀑布流、原始宽高比、直角摄影作品，无卡片背景和阴影。响应式列数为窄屏 1、手机 2、平板 3、桌面 4、宽屏 5、超宽屏 6。
底部悬浮 Dock 集中提供年份、季节、地点、标签、排序和重置；桌面向上弹层，手机集中抽屉，地点与标签可搜索。筛选由 URL Search Params 管理，自动更新、可分享、刷新和前进后退；继续使用原有服务端分页及 `published-desc` / `published-asc` / `taken-desc` / `taken-asc` 参数。
详情页与 Lightbox 保留大图、元数据及相关照片，并携带校验后的档案筛选返回链接。公开条件仍是 approved 且公开衍生资源完整；原图、联系方式与审核信息始终私有。详细规则与验收见 [公开影像指南](docs/gallery.md)。

## 技术栈

TypeScript、pnpm 12、Next.js 16 App Router、React 19、Tailwind CSS 4、shadcn/ui（Radix）、next-themes；SQLite / better-sqlite3 / Drizzle；Better Auth **1.7.7**、同版本 Drizzle Adapter 和官方 `auth` CLI。R2（AWS S3 SDK）、Sharp、Cloudflare Turnstile 已接入，图片与投稿测试使用 Vitest 5；生产可用 Docker Compose 或原生 Node.js + systemd 单实例部署，由外部 HTTP/HTTPS 反向代理提供公网入口。

精确版本以 `pnpm-lock.yaml` 为准。建议 Node.js 24 LTS（见 `.node-version`），pnpm 由 `packageManager` 固定。`pnpm-workspace.yaml` 仅配置依赖构建许可，本项目不是 Monorepo。

## 本地运行与自动初始化

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

设置 `BETTER_AUTH_URL=http://localhost:3000`；本地投稿可使用 Cloudflare 官方 Turnstile 测试 Site Key/Secret，生产必须使用真实域名与生产密钥。`BETTER_AUTH_SECRET` 对新库可留空，首次启动会安全生成并持久化；已有库必须保持原密钥。`STORAGE_DRIVER` 默认 `local`，无需 R2 凭据。`pnpm dev` 在 Next 服务启动前自动检查数据库、运行 Drizzle Migration、初始化存储并创建首个管理员。正常首次部署无需单独执行 `pnpm db:migrate` 或 `pnpm admin:init`。

未指定 `ADMIN_BOOTSTRAP_PASSWORD` 时，初始随机密码存放在数据库同级的 `bootstrap/admin-credentials`（0600）。在可信本地终端执行 `pnpm admin:credentials` 领取，不会通过网页或普通日志显示。初始邮箱默认为 `admin@localhost.invalid`，也可在首次启动前设置 `ADMIN_BOOTSTRAP_EMAIL`、`ADMIN_BOOTSTRAP_PASSWORD` 和 `ADMIN_BOOTSTRAP_NAME`。自动生成密码的管理员首次登录必须到 `/admin/settings` 修改密码；之后可在那里修改名称、登录邮箱和密码。初始化环境变量只用于首次创建，不会覆盖之后的账户变更。完整流程与忘记密码的本地恢复方式见[初始化指南](docs/initialization.md)。

默认数据库 `./data/archive.sqlite`、本地图片 `./data/storage/`；SQLite 主文件/WAL/SHM、密钥、凭据和图片均不提交。重复启动保留全部数据。已有数据库升级前自动执行 SQLite 在线备份，备份失败则不启动应用。构建不需要真实密钥或数据库。审核撤回的 CDN URL 清除仍为可选能力，未配置或失败会持久记录，不会伪称旧缓存立即失效。

## 认证与安全

- Email + Password，关闭公开注册；Admin Plugin 默认角色 `user`，只有服务端初始化可建立首个 `admin`。
- Session 保存在 SQLite，7 天过期，24 小时更新周期；不缓存 Cookie 中的权限。页面及 API 每次服务端读取当前会话与角色，拒绝禁用或被模拟的身份。
- Cookie 为 HttpOnly、SameSite=Lax、host-only；公开 HTTPS origin 自动开启 Secure。HTTP 仅允许本地 loopback。
- 信任来源严格等于 `BETTER_AUTH_URL`，不信任任意转发来源/IP，不关闭 Better Auth 的 CSRF、Origin 与回调校验。客户端仅使用 Cookie，不保存 Token，也不持久化密码。
- SQLite 持久化限流：登录路径共享 10 次/60 秒，其他认证请求共享 100 次/60 秒。当前不可信任客户端 IP，刻意使用保守的共享桶；伪造代理头不能重置额度。启用可信入口前可能看到 Better Auth 的共享桶提示，这不表示限流失效。
- HTTP 认证仅开放登录、退出、会话查询与健康检查；角色修改、用户创建等 Admin Plugin HTTP 接口均未开放。响应移除 Session Token 等敏感字段。

## 页面与 API

| 路由                                                    | 当前行为                                           |
| ------------------------------------------------------- | -------------------------------------------------- |
| `/`、`/archive`、`/photo/[id]`、`/tags/[slug]`          | 公开档案与详情；不存在或非公开照片 404             |
| `/submit`                                               | 匿名批量投稿表单；提交后进入待审核                 |
| `/admin/login`                                          | 真实登录；已登录管理员自动跳转后台                 |
| `/admin`、`/admin/reviews`、`/admin/photos`             | 服务端保护；真实审核队列、状态筛选、发布/撤回/恢复 |
| `/admin/reviews/[id]`                                   | 私有预览、详情、同批照片、元数据编辑、审核历史     |
| `GET /api/admin/me`                                     | 管理员基本信息；匿名 401，非管理员 403             |
| `GET /api/admin/reviews`、`GET /api/admin/reviews/[id]` | 待审核列表与审核详情、同批照片、日志               |
| `POST /api/admin/reviews/[id]/approve` / `reject`       | 条件批准发布或拒绝照片                             |
| `GET /api/admin/photos`、`PATCH /api/admin/photos/[id]` | 管理列表与标题/描述/日期/地点/标签编辑             |
| `POST /api/admin/photos/[id]/hide` / `restore`          | 撤回或恢复公开版本                                 |
| `GET /api/admin/photos/[id]/logs`                       | 管理员审核日志                                     |
| `POST /api/auth/sign-in/email`、`/api/auth/sign-out`    | Better Auth 登录 / 退出                            |
| `GET /api/auth/get-session`、`/api/auth/ok`             | 精简会话响应 / 认证健康检查                        |
| `GET /api/health`                                       | 数据库可用 200，否则 503                           |
| `POST /api/submissions`                                 | 匿名 multipart 投稿；201 pending，失败返回 4xx/5xx |

## 图片存储与处理

默认开发使用 LocalStorage，目录为 `DATABASE_PATH` 同级的 `storage/private` 与 `storage/public`；可设 `LOCAL_STORAGE_PATH`。原图/待审核内容始终私有，只有真实管理员授权的展示图/缩略图写入公开区。生产 driver 未配置默认要求 R2，缺凭据报错；显式 local 用于本地生产验证或自托管，不会静默回退。

JPEG / PNG / WebP 实际内容验证，10 MiB、2400 万像素、16000px 单边限制，完整解码拒绝损坏图。WebP 长边上限为展示 2000、缩略 600、私有预览 1200；不放大、不方形裁剪，自动纠正方向并移除元数据，原始字节完全保留。

新增只读接口：

- `GET /api/admin/photos/[id]/preview`：先鉴权再查数据库，私有 WebP、no-store，401 / 403 / 404。
- `GET /api/images/[...key]`：local 模式下只读公开衍生图，还必须满足数据库 approved；原图、pending、hidden 与非法路径均 404。

```bash
pnpm storage:check
pnpm test:images
```

前者用随机私有探测文件验证并清理，不创建照片或公开图；后者用临时目录/数据库及 SDK mock，无需云凭据。业务层以后必须在两个公开文件成功后才提交 approved，并根据发布 receipt 确认或补偿；中断/清理失败记录在 SQLite `image_operations`。删除对象不能保证 CDN 已缓存图片即时消失。

完整接口、恢复策略、手动 R2 配置、备份与成本见 [存储指南](docs/storage.md)；审核状态机和一致性见 [审核指南](docs/moderation.md)。本阶段没有调用真实 Cloudflare R2 或 CDN API、上传真实照片或部署。

## 匿名投稿

`/submit` 使用全屏照片编辑器：桌面左侧约 65% 的完整照片浏览区、右侧约 35% 的信息面板，左侧原生垂直 Scroll Snap 与右侧当前照片字段按稳定 UUID 联动。两侧独立滚动；照片保留原始比例、直角展示。手机改为上方照片、下方信息和可访问的提交操作栏。

可选择或拖拽、追加 1–5 张 JPEG/PNG/WebP，每张照片独立保存标题、说明、拍摄日期和地点；署名、可选邮箱、备注、授权与 Turnstile 属于整个投稿批次。匿名 API 暂不支持标签，因此没有标签输入。切换不丢失草稿，删除前需确认，错误会定位到具体照片/字段；失败保留输入及预览。文件仍只在最终提交时发送，后端验证、幂等、限流、私有存储与 pending 状态保持原样。详情见 [匿名投稿指南](docs/submissions.md)。

## 开发命令

| 命令                                            | 用途                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                      | 开发服务器                                                        |
| `pnpm typecheck` / `pnpm lint`                  | 路由与严格类型检查 / ESLint                                       |
| `pnpm format` / `pnpm format:check`             | 格式化 / 格式检查                                                 |
| `pnpm test`                                     | 临时 SQLite 的业务、认证、安全与迁移测试                          |
| `pnpm check`                                    | 类型、Lint、格式与集成测试                                        |
| `pnpm build` / `pnpm start`                     | standalone 生产构建 / 本地生产服务                                |
| `pnpm build:native`                             | 编译迁移、构建并打包原生发行目录 `dist/native/`                   |
| `pnpm test:auth-flow`                           | 先 build，再自动启动临时数据库生产服务做 HTTP 流程验证            |
| `pnpm db:generate` / `pnpm db:migrate`          | 生成 / 应用 Drizzle Migration                                     |
| `pnpm db:studio` / `pnpm db:compile`            | 本地数据库工具 / 编译两种部署共用的迁移脚本                       |
| `pnpm admin:credentials` / `pnpm admin:recover` | 本地领取初始凭据 / 可信 TTY 恢复现有管理员密码                    |
| `pnpm auth:secret` / `pnpm admin:init`          | 手动维护密钥 / 旧式管理员初始化工具，正常首次启动无需执行         |
| `pnpm auth:check`                               | 官方 CLI 校验认证 Schema，需要认证环境配置                        |
| `pnpm auth:generate`                            | 认证升级时重新生成 Schema；先审阅差异，再生成新 Drizzle Migration |

新增命令：`pnpm test:images`（图片、存储、投稿、审核、公开影像 Vitest，已加入 `pnpm check`）、`pnpm storage:check`（本地探测）。维护者配置真实 R2 后可主动执行 `pnpm storage:check --allow-r2`，只做 Bucket HEAD，不修改资源；本次未执行云检查。

生产迁移前备份，使用 `generate` / `migrate`，不使用 `push` 替代版本管理，不编辑历史 Migration。所有测试账号和随机密码仅用于独立临时数据库，测试后删除。

## 目录

```text
src/
  app/(public)/                 # 公开首页、档案、标签、详情、投稿
  app/admin/login/              # 登录独立于受保护布局
  app/admin/(dashboard)/        # 后台、审核、照片管理
  app/api/auth/[...all]/        # 限定 Better Auth HTTP 接口
  app/api/admin/                # 每个 API 单独鉴权
  components/ui/                # shadcn/ui
  components/admin-*.tsx        # 登录、退出、后台布局
  components/submit/             # 多图片选择、元数据和 Turnstile 表单
  lib/auth-client.ts            # 浏览器认证客户端
  server/auth/                  # 配置、会话/权限、页面保护、官方 CLI 配置
  server/db/                    # 业务与认证 Schema、连接
  server/storage/               # Adapter、Key、配置、URL、持久操作日志
  server/images/                # 验证、元数据、Sharp、集中参数
  server/services/image-service.ts # 文件操作，业务状态由未来审核服务负责
  server/security/                # Turnstile、来源 HMAC、投稿限制
  server/services/                # ImageService、SubmissionService
  types/                        # 公开及管理员 DTO
  instrumentation.ts            # 运行时认证环境校验
drizzle/                        # 增量 SQL 与快照
scripts/                        # 管理员初始化、迁移、生产启动
tests/{storage,images,submissions}/ # Vitest，隔离数据与 SDK mock
tests/http/                     # 真正 Next.js 服务的认证/图片 HTTP 流程
docs/                           # 中文架构、路线图、验证记录
data/                           # 持久化数据，不提交
```

## 生产部署

- [Docker Compose 部署](docs/deployment.md)：镜像内运行 Standalone，SQLite 和可选本地图片放持久卷。
- [原生 Node.js + systemd 部署](docs/deployment-native.md)：在兼容 Linux 环境构建 `dist/native/`，服务由 systemd 管理，数据库和图片放持久目录。

两种方式使用同一套业务代码、Migration、运行时变量、SQLite Backup API 和恢复脚本；均需用户自行管理外部 HTTPS 反向代理。原生构建必须匹配 Linux 架构、Node 与 libc，macOS 构建产物不能直接部署到 Linux。生产运行不需要 Cloudflare Tunnel。

## Docker Compose 部署

填写私有 `.env.production` 中的实际 HTTPS 域名和生产 Turnstile 配置后：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
docker compose --env-file .env.production up -d --build app
```

容器启动前自动完成必要初始化，失败不会就绪；默认只把 HTTP 端口绑定到宿主机回环地址。自动生成的管理员密码使用 `docker compose --env-file .env.production exec app node migrations/scripts/admin-credentials.mjs` 在可信 TTY 领取。详细步骤、备份/更新/回滚见 [Docker 部署指南](docs/deployment.md)；原生服务参见 [Node.js + systemd 指南](docs/deployment-native.md)。两个方案均不配置外部代理、TLS 或 Cloudflare Tunnel。
