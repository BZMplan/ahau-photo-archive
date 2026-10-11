# AH AU Photo Archive

轻量的校园影像档案馆，长期整理校园建筑、自然风景、四季变化、校园生活和历史影像。一个 Next.js 全栈项目，公开浏览无需登录，后续支持匿名投稿和管理员审核。

当前完成**第三阶段：图片存储与处理基础设施**。支持隔离的本地/R2 存储、Sharp 验证与衍生图、管理员私有预览，以及发布/撤回底层服务。管理员认证继续可用；没有公开上传、发布接口或完整审核业务，图片 UI 和检索仍未开放。

## 技术栈

TypeScript、pnpm 12、Next.js 16 App Router、React 19、Tailwind CSS 4、shadcn/ui（Radix）、next-themes；SQLite / better-sqlite3 / Drizzle；Better Auth **1.7.7**、同版本 Drizzle Adapter 和官方 `auth` CLI。R2（AWS S3 SDK）、Sharp 已实现，图片测试使用 Vitest 5；Turnstile 后续服务端验证。Docker 单实例部署，未来通过 Cloudflare Tunnel 提供服务。

精确版本以 `pnpm-lock.yaml` 为准。建议 Node.js 24 LTS（见 `.node-version`），pnpm 由 `packageManager` 固定。`pnpm-workspace.yaml` 仅配置依赖构建许可，本项目不是 Monorepo。

## 本地运行与首个管理员

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm auth:secret
```

将命令生成的随机密钥填入 `.env.local` 的 `BETTER_AUTH_SECRET`，至少 32 字符；保留 `BETTER_AUTH_URL=http://localhost:3000` 或设置为你实际访问的本地 origin。不要把密钥粘贴到命令参数或提交到 Git。本地设置 `STORAGE_DRIVER=local`，R2 / Turnstile 凭据留空。已有 `.env.local` 时仅补充新变量，不覆盖原有认证密钥。

```bash
pnpm db:migrate
pnpm admin:init
pnpm dev
```

`pnpm admin:init` **必须在本地交互式终端执行且不带参数**：先检查是否已有管理员，再委托 Better Auth 官方 `auth create-admin` 询问邮箱和密码（初始显示姓名为 `Admin`）。密码输入被遮蔽，长度为 12–128 字符，由 Better Auth 哈希；没有默认密码。已有管理员时停止，不开放初始化 HTTP API，也不在服务器启动时创建账号。普通用户不能注册。该工具用于可信的本地开发/运维终端，不通过远程网页输入凭据。

打开 <http://localhost:3000/admin/login>，填写刚创建的邮箱和密码，成功后进入 `/admin`；后台右上角可退出。刷新页面保持会话，过期或退出后访问后台会回到登录页。

默认数据库 `./data/archive.sqlite`；迁移命令创建目录，应用请求不自动建表。`.env.local`、SQLite / WAL / SHM 文件已忽略。启动时校验认证和当前存储驱动配置，缺少必要项拒绝启动；生产构建无需密钥。没有为你创建真实管理员或保存任何测试账号到开发数据库。

## 认证与安全

- Email + Password，关闭公开注册；Admin Plugin 默认角色 `user`，只有服务端初始化可建立首个 `admin`。
- Session 保存在 SQLite，7 天过期，24 小时更新周期；不缓存 Cookie 中的权限。页面及 API 每次服务端读取当前会话与角色，拒绝禁用或被模拟的身份。
- Cookie 为 HttpOnly、SameSite=Lax、host-only；公开 HTTPS origin 自动开启 Secure。HTTP 仅允许本地 loopback。
- 信任来源严格等于 `BETTER_AUTH_URL`，不信任任意转发来源/IP，不关闭 Better Auth 的 CSRF、Origin 与回调校验。客户端仅使用 Cookie，不保存 Token，也不持久化密码。
- SQLite 持久化限流：登录路径共享 10 次/60 秒，其他认证请求共享 100 次/60 秒。当前不可信任客户端 IP，刻意使用保守的共享桶；伪造代理头不能重置额度。启用可信入口前可能看到 Better Auth 的共享桶提示，这不表示限流失效。
- HTTP 认证仅开放登录、退出、会话查询与健康检查；角色修改、用户创建等 Admin Plugin HTTP 接口均未开放。响应移除 Session Token 等敏感字段。

## 页面与 API

| 路由                                                 | 当前行为                                       |
| ---------------------------------------------------- | ---------------------------------------------- |
| `/`、`/photo/[id]`                                   | 公开档案与详情；不存在或非公开照片 404         |
| `/submit`                                            | 禁用的投稿预览                                 |
| `/admin/login`                                       | 真实登录；已登录管理员自动跳转后台             |
| `/admin`、`/admin/reviews`、`/admin/photos`          | 服务端保护；后台布局、当前管理员、后续业务入口 |
| `GET /api/admin/me`                                  | 管理员基本信息；匿名 401，非管理员 403         |
| `GET /api/admin/photos`                              | 同样鉴权，通过后 501，照片业务尚未实现         |
| `POST /api/auth/sign-in/email`、`/api/auth/sign-out` | Better Auth 登录 / 退出                        |
| `GET /api/auth/get-session`、`/api/auth/ok`          | 精简会话响应 / 认证健康检查                    |
| `GET /api/health`                                    | 数据库可用 200，否则 503                       |
| `POST /api/submissions`                              | 501，尚未实现                                  |

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

完整接口、恢复策略、手动 R2 配置、备份与成本见 [存储指南](docs/storage.md)。本阶段没有调用真实 Cloudflare API、上传真实照片或部署。

## 开发命令

| 命令                                   | 用途                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                             | 开发服务器                                                        |
| `pnpm typecheck` / `pnpm lint`         | 路由与严格类型检查 / ESLint                                       |
| `pnpm format` / `pnpm format:check`    | 格式化 / 格式检查                                                 |
| `pnpm test`                            | 临时 SQLite 的业务、认证、安全与迁移测试                          |
| `pnpm check`                           | 类型、Lint、格式与集成测试                                        |
| `pnpm build` / `pnpm start`            | standalone 生产构建 / 本地生产服务                                |
| `pnpm test:auth-flow`                  | 先 build，再自动启动临时数据库生产服务做 HTTP 流程验证            |
| `pnpm db:generate` / `pnpm db:migrate` | 生成 / 应用 Drizzle Migration                                     |
| `pnpm db:studio` / `pnpm db:compile`   | 本地数据库工具 / 编译 Docker 迁移脚本                             |
| `pnpm auth:secret` / `pnpm admin:init` | 生成认证密钥 / 安全初始化首个管理员                               |
| `pnpm auth:check`                      | 官方 CLI 校验认证 Schema，需要认证环境配置                        |
| `pnpm auth:generate`                   | 认证升级时重新生成 Schema；先审阅差异，再生成新 Drizzle Migration |

新增命令：`pnpm test:images`（Vitest，已加入 `pnpm check`）、`pnpm storage:check`（本地探测）。维护者配置真实 R2 后可主动执行 `pnpm storage:check --allow-r2`，只做 Bucket HEAD，不修改资源；本次未执行云检查。

生产迁移前备份，使用 `generate` / `migrate`，不使用 `push` 替代版本管理，不编辑历史 Migration。所有测试账号和随机密码仅用于独立临时数据库，测试后删除。

## 目录

```text
src/
  app/(public)/                 # 公开首页、详情、投稿
  app/admin/login/              # 登录独立于受保护布局
  app/admin/(dashboard)/        # 后台、审核、照片管理
  app/api/auth/[...all]/        # 限定 Better Auth HTTP 接口
  app/api/admin/                # 每个 API 单独鉴权
  components/ui/                # shadcn/ui
  components/admin-*.tsx        # 登录、退出、后台布局
  lib/auth-client.ts            # 浏览器认证客户端
  server/auth/                  # 配置、会话/权限、页面保护、官方 CLI 配置
  server/db/                    # 业务与认证 Schema、连接
  server/storage/               # Adapter、Key、配置、URL、持久操作日志
  server/images/                # 验证、元数据、Sharp、集中参数
  server/services/image-service.ts # 文件操作，业务状态由未来审核服务负责
  server/{security,services}/
  types/                        # 公开及管理员 DTO
  instrumentation.ts            # 运行时认证环境校验
drizzle/                        # 增量 SQL 与快照
scripts/                        # 管理员初始化、迁移、生产启动
tests/{storage,images}/         # Vitest，隔离数据与 SDK mock
tests/http/                     # 真正 Next.js 服务的认证/图片 HTTP 流程
docs/                           # 中文架构、路线图、验证记录
data/                           # 持久化数据，不提交
```

## Docker 与未来 Tunnel

```bash
docker compose --env-file .env.local up --build -d
docker compose logs -f archive
```

Compose 要求传入认证配置和所选驱动配置，密钥仅运行时传递，不写入镜像。`STORAGE_DRIVER=local` 将图片存入同一持久卷的 `/app/data/storage`；R2 模式需完整 R2 配置，默认要求 r2，见存储指南。容器非 root，启动先迁移；数据库在 `archive-data` 命名卷，端口绑定 `127.0.0.1:3000`。首次初始化需要在可信本地终端使用源码与官方 CLI 访问同一数据库；精简运行镜像不包含开发 CLI，不能对另一份数据库创建账号后期待容器自动同步。

通过 Tunnel 上线时将 URL 设置为真实外部 HTTPS origin；浏览器在这个 origin 登录，Cookie 使用 Secure。应用不根据任意 Host / X-Forwarded-* 推断认证域名。入口保持私有或 loopback，在配置可信代理前不启用 IP 头。当前没有创建 Tunnel，也没有调用 Cloudflare API。

`docker compose down -v` 删除数据卷。备份使用 SQLite 在线备份或停服务后完整复制数据目录。构建不需要数据库、认证密钥或 R2 凭据。详情见 [架构](docs/architecture.md)、[路线图](docs/roadmap.md)、[验证记录](docs/validation.md)、[开发约定](AGENTS.md)。
