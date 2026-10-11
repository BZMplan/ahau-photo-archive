# AH AU Photo Archive

轻量的校园影像档案馆，长期整理校园建筑、自然风景、四季变化、校园生活和历史影像。采用一个 Next.js 全栈项目，公开浏览无需登录，后续支持匿名投稿和管理员审核。

当前完成**第一阶段：初始化、基础架构与页面骨架**。首页读取真实 SQLite 数据，初始为空；没有演示照片、普通用户账号或虚假上传结果。投稿、登录、审核、图片访问和筛选尚未开放。

## 技术栈

- TypeScript、pnpm 12、Next.js 16 App Router、React 19
- Tailwind CSS 4、shadcn/ui（Radix）、next-themes
- SQLite、better-sqlite3、Drizzle ORM / Drizzle Kit
- 已安装并预留接口：Better Auth、R2（AWS S3 SDK）、Sharp；Turnstile 后续通过服务端 HTTP 验证，无需额外 SDK
- Docker 单实例部署，后续通过 Cloudflare Tunnel 提供服务

精确安装版本以 `pnpm-lock.yaml` 为准。建议 Node.js 24 LTS（见 `.node-version`），pnpm 版本由 `packageManager` 固定。`pnpm-workspace.yaml` 仅用于依赖构建许可配置，本项目不是 Monorepo。

## 本地运行

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

打开 <http://localhost:3000>。第一阶段无需 `.env` 或 Cloudflare 凭据。默认数据库为 `./data/archive.sqlite`，迁移命令自动创建目录。首次运行或更新 Schema 后先迁移；应用不会在请求中自动建表。

需要修改配置时，将 `.env.example` 复制为 `.env.local`，仅调整 `DATABASE_PATH`，其余凭据留空。环境文件、数据库及 WAL/SHM 文件均已忽略；不要提交真实密钥。生产使用绝对路径及持久化存储。

## 页面与 API

| 路由                    | 当前行为                                        |
| ----------------------- | ----------------------------------------------- |
| `/`                     | 公开档案、空状态、响应式网格骨架、浅色/深色主题 |
| `/photo/[id]`           | 公开元数据详情；不存在或非公开照片返回 404      |
| `/submit`               | 禁用的表单预览，不接收文件或保存信息            |
| `/admin/login`          | 禁用的登录预览                                  |
| `/admin`                | 无真实管理数据的后台布局预览                    |
| `/admin/reviews`        | 审核页面骨架                                    |
| `/admin/photos`         | 照片管理页面骨架                                |
| `GET /api/health`       | 数据库已迁移且可用时 200，否则 503              |
| `POST /api/submissions` | 501，投稿尚未实现                               |
| `GET /api/admin/photos` | 401，认证未接入，默认拒绝访问                   |

后台目前可公开查看静态布局。接入管理数据前必须加服务端会话和管理员权限检查；每个管理员 API / Server Action 独立鉴权。没有初始化管理员账号或开放认证路由。

## 开发命令

| 命令                                | 用途                                     |
| ----------------------------------- | ---------------------------------------- |
| `pnpm dev`                          | 开发服务器                               |
| `pnpm typecheck`                    | 路由类型生成与严格类型检查               |
| `pnpm lint`                         | ESLint                                   |
| `pnpm format` / `pnpm format:check` | 格式化 / 格式检查                        |
| `pnpm test`                         | 临时 SQLite、公开隐私与 API 边界集成测试 |
| `pnpm check`                        | 类型、Lint、格式和测试                   |
| `pnpm build` / `pnpm start`         | 生产构建 / 本地生产服务                  |
| `pnpm db:generate`                  | 生成 SQL Migration                       |
| `pnpm db:migrate`                   | 应用 Migration，可重复执行               |
| `pnpm db:studio`                    | 本地 Drizzle Studio，请先迁移            |
| `pnpm db:compile`                   | 编译 Docker 迁移脚本                     |

使用 `generate` 和 `migrate` 管理数据库版本，不使用 `push` 替代 Migration。UUID 和默认时间由 Drizzle 应用生成，原生 SQL 需显式提供。拍摄日期为可空 `YYYY-MM-DD`，其他时间使用 UTC Unix 毫秒。

## 目录

```text
src/
  app/
    (public)/                 # 首页、详情、投稿
    admin/login/              # 登录
    admin/(dashboard)/        # 后台概览、审核、管理
    api/                      # 健康检查与预留 API
  components/ui/              # shadcn/ui；components 下为共享页面组件
  lib/                        # UI 工具
  server/
    db/                       # Schema 与连接
    auth/                     # 管理员会话边界
    storage/                  # R2 接口
    images/                   # Sharp 接口
    security/                 # Turnstile 接口
    services/                 # 查询、投稿、审核
  types/                      # 公开 DTO 与共享类型
drizzle/                      # SQL 与快照，提交 Git
scripts/                      # 迁移脚本
tests/                        # 集成测试
docs/                         # 架构与路线图
data/                         # 自动创建，不提交
```

## Docker

```bash
docker compose up --build -d
docker compose logs -f archive
```

容器以非 root 用户运行，启动前迁移，数据库保存在 `archive-data` 命名卷中，端口仅绑定 `127.0.0.1:3000`。`docker compose down -v` 会删除持久化数据。备份应使用 SQLite 在线备份或先停服务备份整个数据目录，不能只复制正在写入的主数据库文件。

构建不需要数据库或 R2 凭据。当前不配置 Tunnel、不调用真实 Cloudflare API。Docker 引擎需要本机安装并启动，实际验证记录见 [验证记录](docs/validation.md)。

后续开发请阅读 [架构设计](docs/architecture.md)、[路线图](docs/roadmap.md) 和 [项目约定](AGENTS.md)。
