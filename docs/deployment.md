# Docker Compose 生产部署

这是方案 A。无 Docker 的普通 Linux 服务器可使用[原生 Node.js Standalone + systemd 部署](deployment-native.md)。两种方式共用 Drizzle Migration、运行时变量语义、图片服务、SQLite 在线备份和恢复脚本。

本项目以单个 Next.js standalone 容器运行，SQLite 数据位于 `archive-data` 卷，数据库备份位于独立的 `archive-backups` 卷。生产照片推荐存 Cloudflare R2；显式选择 `local` 时，原图和衍生图也在 `archive-data` 的 `/app/data/storage`，必须一并保护。外部反向代理负责 HTTPS；本项目只提供 HTTP，不配置代理或证书。

## 环境与配置

使用支持 Docker Compose v2 的普通 Linux 主机、持久的本地磁盘和与镜像匹配的 CPU 架构。镜像基于 Node.js 24 Debian slim，`better-sqlite3` 与 Sharp 的原生模块在同一 Linux 构建环境安装和运行。建议先预留至少 2 GiB 内存、足够的数据库/备份空间，并按实际批量图片处理负载测量；单实例 SQLite 不部署在不可靠的共享网络文件系统上。

在可信终端克隆项目后，复制 `.env.production.example` 为**不提交到 Git** 的 `.env.production`，限制文件权限并填写：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

- `BETTER_AUTH_URL` 是浏览器实际访问的 HTTPS origin，也是 Better Auth 固定 `baseURL` / 唯一可信来源、公开 SEO URL 与 Turnstile 预期 hostname。仅本地 loopback 测试可用 HTTP。不需要另设 `APP_URL`。
- `BETTER_AUTH_SECRET` 和 `RATE_LIMIT_SECRET` 是独立的随机服务端密钥；前者至少 32 字符。不要使用默认值或记录在命令行参数中。
- `DATABASE_PATH` 是本地脚本变量；Compose 固定为持久卷内 `/app/data/archive.sqlite`，不使用重复的 `DATABASE_URL`。`NODE_ENV=production`、`HOSTNAME=0.0.0.0`、容器内 `PORT=3000` 由镜像设置。可用 `APP_PORT` 调整宿主机回环监听端口；默认仅 `127.0.0.1:3000`，不要改为公网地址。`APP_IMAGE` 是 Compose 的应用镜像标签，默认 `ahau-photo-archive-app:latest`，可用于明确选择旧镜像。
- `STORAGE_DRIVER=r2` 为推荐生产模式。配置 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_PRIVATE_BUCKET`、`R2_PUBLIC_BUCKET`、`R2_PUBLIC_BASE_URL`；两个桶不同，公开 URL 为独立的 HTTPS origin。凭据只在运行时传入，不进入镜像。生产缺 R2 配置会失败，不会静默回退到 local。可选 CDN URL 清除使用 `CLOUDFLARE_ZONE_ID`、`CLOUDFLARE_CACHE_PURGE_TOKEN`，它们与对象存储凭据分开。
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 是**公开** Site Key，投稿页在服务端按请求读取并传给客户端，因此同一镜像可配不同域名；`TURNSTILE_SECRET_KEY` 只在运行时服务端使用。生产 Widget 必须绑定真实公开域名，使用生产密钥，不能使用官方测试密钥。Siteverify 仍检查 success、hostname 与 action；缺 Secret 时投稿失败。
- `TRUSTED_PROXY_IP_HEADER` 默认留空，投稿限流使用保守共享桶。仅当入口不可绕过，代理剥离外部同名头并重写客户端 IP 时才设置；Better Auth 认证限流仍为 SQLite 共享 per-path 桶。不得直接信任任意 `X-Forwarded-For`。

R2 与 SQLite 是两份不同的数据：SQLite 备份不包含 R2 原图；R2 原图也不能替代业务记录。生产启用真实 R2 前按 [存储指南](storage.md) 验证桶权限、私有策略和公开 URL，不通过本部署流程调用 Cloudflare 管理 API。

## 首次部署

以下命令均在项目目录执行，`.env.production` 已填写真实配置。所有 `docker compose` 命令使用同一项目名、同一环境文件，以保持卷身份一致。

```bash
docker compose --env-file .env.production build app admin-init
docker compose --env-file .env.production run --rm --no-deps --entrypoint node app migrations/scripts/migrate.js
docker compose --env-file .env.production --profile admin run --rm --no-deps admin-init
docker compose --env-file .env.production up -d --wait app
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app
```

`admin-init` 只是显式调用的临时 CLI 容器，使用同一数据库卷，在可信交互式 TTY 中安全输入密码；它不会随 `up app` 启动，也不在 Runner 镜像中安装开发工具。已有管理员时初始化会拒绝再次创建。不要使用默认密码或向生产库填测试账号。

宿主机代理可访问 `127.0.0.1:3000`（或设置的 `APP_PORT`）。若外部代理位于另一个 Docker 容器，可由部署者将该代理容器连接到本项目受控的 Compose 网络，使用服务名 `app:3000`；该网络只能连接受信任的代理，不能将应用端口直接发布至公网。本项目不创建代理服务。代理须接受正确的公开 Host，转发原始 Origin；如使用转发头，应覆盖客户端自带的 `X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Forwarded-For`，但应用不会据此动态放宽可信来源。代理限制上传请求体需兼容 52 MiB multipart 上限，读取/转发/空闲超时需覆盖图片上传和处理时间。应用继续限制单张 10 MiB、批次 50 MiB、最多 5 张，不能由代理替代。

`GET /api/health` 为无需认证的轻量 SQLite 就绪检查，正常返回 `{ "data": { "status": "ok" } }`，数据库不可用时返回 503；不调用 R2。Compose 每 30 秒执行 Node 内置 `fetch` 健康检查。先在宿主机回环地址检查响应，再经外部 HTTPS 域名验证首页、档案、管理员登录、私有预览拒绝、公开图片、Turnstile 投稿和审核流程。不要在正式库使用测试照片代替人工验收。

## 日常维护与更新

查看状态、轮转后的 stdout/stderr 日志和磁盘空间：

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app
docker system df
```

日志使用 Docker `json-file`，每文件 10 MiB、保留 3 个文件；应用和迁移不应打印密钥、Token、完整联系方式或图片字节。备份脚本使用 SQLite 在线 Backup API，包含已提交 WAL 数据，备份后做 `quick_check`，生成唯一时间戳文件并在失败时返回非零状态：

```bash
docker compose --env-file .env.production run --rm --no-deps --entrypoint node app migrations/scripts/backup-db.mjs
```

备份在 `archive-backups` 卷内。定期把它复制到主机以外并做隔离恢复演练；同机卷不能替代异地备份。`STORAGE_DRIVER=local` 时还需单独复制 `/app/data/storage`；R2 模式则独立保护原图和对象清单。不要对正在写入的 SQLite 只复制主文件。不要执行 `docker compose down -v`，该命令会删除数据和备份卷。

应用容器存在时，可把备份卷中的文件导出到宿主机，再从宿主机复制到异地存储；导出的文件也应限制访问权限：

```bash
mkdir -p ./backups
chmod 700 ./backups
docker compose --env-file .env.production cp app:/app/backups/. ./backups/
```

后续更新先检查新旧版本与 Migration 兼容性，并在同一终端保存旧镜像标签，再停旧应用、备份、构建、迁移和启动：

```bash
OLD_IMAGE_TAG="ahau-photo-archive-app:before-update-$(date -u +%Y%m%d%H%M%S)"
docker image tag "$(docker compose --env-file .env.production images -q app)" "$OLD_IMAGE_TAG"
docker compose --env-file .env.production stop app
docker compose --env-file .env.production run --rm --no-deps --entrypoint node app migrations/scripts/backup-db.mjs
docker compose --env-file .env.production build app
docker compose --env-file .env.production run --rm --no-deps --entrypoint node app migrations/scripts/migrate.js
docker compose --env-file .env.production up -d --wait app
docker compose --env-file .env.production ps
```

先用旧镜像完成备份，再构建新镜像，避免新版本程序误读旧库。迁移失败时不要执行 `up`；若仍使用旧 Schema，可用 `docker compose --env-file .env.production start app` 重启原容器。Migration 使用提交的 Drizzle SQL，重复执行安全；不会重建业务表或自动清空数据。应用容器启动前只读核对已应用 Migration；若旧库落后则退出，不自动执行迁移。核对通过后执行 `node server.js`。

若新容器启动失败，先判断旧镜像是否兼容已迁移的 Schema。确认兼容后，可在保存了 `OLD_IMAGE_TAG` 的终端运行：

```bash
APP_IMAGE="$OLD_IMAGE_TAG" docker compose --env-file .env.production up -d --no-build --force-recreate app
```

若 Schema 不兼容，应停止应用，按下文恢复迁移前数据库备份，并核对 R2 或 local 图片对象版本后，再使用旧镜像。恢复点之后的投稿、审核与会话数据会丢失，不能只换镜像就宣称数据库已回滚。部署者需记录旧镜像标签和对应的备份文件名。

恢复前确认应用已停止，并明确接受恢复点之后的投稿、审核和 Session 数据可能丢失。选择 `archive-backups` 卷中的备份文件名（仅文件名），显式传入确认变量：

```bash
docker compose --env-file .env.production stop app
docker compose --env-file .env.production run --rm --no-deps -e RESTORE_CONFIRM=YES --entrypoint node app migrations/scripts/restore-db.mjs archive-YYYY-MM-DDTHH-MM-SS-sssZ-UUID.sqlite
docker compose --env-file .env.production up -d --wait app
```

恢复脚本验证 `quick_check` 和业务表，先用 Backup API 保存当前库的 `archive-before-restore-*` 副本，停止状态下 checkpoint 后替换数据库并移除旧 WAL/SHM。它不会自动运行。恢复与旧应用镜像/新 Schema 是否兼容必须另行核对；镜像回滚不会自动回滚数据库，也不会还原 R2 或 local 图片文件。若已迁移新 Schema，应确认旧镜像兼容，或使用迁移前备份一同恢复对应的数据与图片版本；不自动执行破坏性 Schema 回滚。

## 故障排查

| 现象                                          | 检查方向                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker 构建或 Sharp / SQLite 原生模块加载失败 | 检查镜像 CPU 架构、Node 24、Debian slim、冻结锁文件安装及 Linux 容器内 `require('sharp')` / `require('better-sqlite3')`；不要混用宿主机 `node_modules`。 |
| SQLite 无法打开、健康检查失败或容器反复重启   | 检查 `archive-data` 卷、非 root 写权限、磁盘空间、Migration 输出和 `docker compose logs app`。健康接口不探测 R2。                                        |
| R2 连接失败或图片不显示                       | 检查运行时 R2 变量、桶权限、公开 URL 与 CDN 状态；不要把私有桶开放或切到 local 掩盖错误。                                                                |
| 管理员无法登录、HTTPS Cookie 异常             | 检查 `BETTER_AUTH_URL` 为真实 HTTPS origin、代理 Host/Origin 转发、浏览器 Secure Cookie、时间与数据库 Session；保留 CSRF 和管理员权限检查。              |
| Turnstile 失败                                | 检查运行时 Site Key、Secret、Widget 绑定域名、Siteverify hostname/action；生产不得使用测试凭据。                                                         |
| 上传返回 413 或超时                           | 检查代理 body limit、请求超时、52 MiB multipart 限制、单张 10 MiB 和图片处理队列；不要取消服务端限制。                                                   |

Runner 不含 `curl`、`wget` 或开发 CLI，健康命令使用 Node。容器以非 root 用户运行、去除 Linux capabilities、禁止新增特权，保留 `/app/data` 和 `/app/backups` 可写。对于备份、真实 R2、浏览器和代理链路，应在维护者配置的环境中另行验收。
