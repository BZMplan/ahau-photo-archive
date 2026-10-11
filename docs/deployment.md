# Docker Compose 生产部署

这是与[原生 Node.js + systemd 部署](deployment-native.md)并列的单实例方式。两者使用同一套 BootstrapService、Drizzle Migration、图片存储、环境变量、SQLite 在线备份及恢复脚本。详细初始化行为见[自动初始化指南](initialization.md)。公网 HTTPS 与反向代理由部署者管理；项目只提供 HTTP，不配置代理、TLS 或 Cloudflare Tunnel。

## 配置与首次启动

使用支持 Docker Compose v2 的 Linux 主机和持久本地磁盘。镜像采用 Node.js 24 Debian slim，在 Linux 内构建 Sharp 与 better-sqlite3。复制示例文件并设置权限：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

必须填写真实公开 HTTPS `BETTER_AUTH_URL`，以及生产 Turnstile Site Key/Secret；可填写稳定的 `BETTER_AUTH_SECRET`（至少 32 字符）。全新数据库若留空，Bootstrap 在数据卷内生成并保存高熵密钥；已有库必须继续提供原密钥或保留原生成密钥文件，否则拒绝启动。`RATE_LIMIT_SECRET` 建议使用另一独立随机值。`STORAGE_DRIVER` 默认 `local`，使用 `/app/data/storage/private` 与 `public`；设置 `r2` 时必须填写 R2 账户、密钥、两个不同桶和公开 HTTPS 图片域名，不会回退到本地。R2 默认只检查桶与权限；`R2_AUTO_CREATE_BUCKETS=true` 才尝试创建缺失桶，公开自定义域名及私有桶访问策略仍需在 Cloudflare 配置。

首次管理员可填写 `ADMIN_BOOTSTRAP_EMAIL`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_NAME`；留空密码则随机生成并存入受保护的持久文件。环境变量只用于首次创建。不要在 Git、镜像或日志写入真实密钥。只有代理入口不可绕过且剥离、重写来源头后，才设置 `TRUSTED_PROXY_IP_HEADER`。代理需转发正确 Host/Origin，支持 52 MiB 请求体与上传超时；应用仍精确校验 Origin、权限、Turnstile hostname/action 和图片限制。

```bash
docker compose --env-file .env.production up -d --build app
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app
```

容器作为非 root 用户启动。启动脚本先检查密钥、Turnstile、SQLite、Migration、存储和管理员，必要时自动创建；已有数据库升级先调用 SQLite Backup API，失败则网站不启动。成功后 `exec node server.js`。`GET /api/health` 检查 SQLite 就绪，Compose 默认只把应用映射到宿主机 `127.0.0.1:3000`。首次启动**不需要**单独执行 `db:migrate` 或 `admin:init`。如密码自动生成，在可信终端领取：

```bash
docker compose --env-file .env.production exec app node migrations/scripts/admin-credentials.mjs
```

首次登录须在 `/admin/settings` 修改随机初始密码；服务端会阻止其它后台功能。不要在正式库填测试照片或使用 Turnstile 测试密钥。代理、真实 R2 与浏览器业务流程须由部署者在目标环境验收。

## 备份、更新与恢复

SQLite 数据库主文件、WAL/SHM、Bootstrap 密钥和可选 local 图片都在 `archive-data` 卷；备份在 `archive-backups` 卷。备份脚本用 SQLite Backup API 纳入已提交 WAL，生成唯一时间戳文件并做完整性检查：

```bash
docker compose --env-file .env.production exec app node migrations/scripts/backup-db.mjs
```

升级前保留旧镜像标签和备份文件名，先备份，再构建/启动新镜像。新镜像启动时只执行尚未应用的 Migration，升级前会再做一致性备份；失败则容器不就绪。`docker compose down -v` 会删除持久卷，禁止用于日常更新。同机备份不替代异地备份；local 照片和 R2 对象需分别保护。

```bash
docker compose --env-file .env.production stop app
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d app
docker compose --env-file .env.production ps
```

代码镜像回滚不等于数据库 Schema 回滚。先核对旧镜像与新 Schema 是否兼容；不兼容时须停服务、核对图片版本并显式恢复迁移前备份，恢复点后投稿/审核/Session 会丢失。恢复要求服务停止并提供备份文件名：

```bash
docker compose --env-file .env.production stop app
docker compose --env-file .env.production run --rm --no-deps -e RESTORE_CONFIRM=YES --entrypoint node app migrations/scripts/restore-db.mjs archive-YYYY-MM-DDTHH-MM-SS-sssZ-UUID.sqlite
docker compose --env-file .env.production up -d app
```

恢复脚本先核对备份完整性，再备份当前库、checkpoint 并替换主库与旧 WAL/SHM。不会自动恢复 R2/local 图片。管理员遗忘密码可在可信 TTY 使用 `docker compose --env-file .env.production exec app node migrations/admin-recover.cjs`，再用领取命令获取随机新密码。无匿名恢复接口。

## 故障排查

`docker compose --env-file .env.production logs --tail=100 app` 可查看初始化失败原因。重点检查卷与备份目录写权限、磁盘空间、现有库完整性、原认证密钥、Turnstile 真实凭据及 R2 桶权限。健康接口不探测 R2；完整验收还需检查登录/退出、投稿、审核、私有预览权限及公开图片。容器日志由 Compose 限制为每文件 10 MiB、保留 3 个文件。R2 创建桶不等于公开域名可用，也不会开放私有原图。
