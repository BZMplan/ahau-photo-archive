# 原生 Linux 部署：Node.js Standalone + systemd

本方式与 [Docker Compose](deployment.md) 共用应用、BootstrapService、Drizzle Migration、图片存储和 SQLite 在线备份/恢复。无需在目标服务器安装 Docker；已打包应用的启动和数据库维护也无需 pnpm。公网 HTTPS 反向代理由部署者自行管理，项目不提供代理、证书或 Cloudflare Tunnel。自动初始化细节见[初始化指南](initialization.md)。

## 构建与平台

推荐 Debian 12 或 Ubuntu 24.04、Linux x64 或 arm64、Node.js 24。源码构建机使用 `package.json` 固定的 pnpm 12.10.1：

```bash
pnpm install --frozen-lockfile
pnpm build:native
```

`dist/native/` 包含 `server.js`、Standalone 依赖、`.next/static`、`public`、统一 Bootstrap/迁移/备份/恢复/管理员恢复工具、`drizzle/` SQL 和 `build-info.json`。可打包传输这个目录；保留符号链接和文件权限。构建产物不含真实 `.env`、SQLite、备份或照片。Sharp 与 better-sqlite3 的原生模块必须匹配目标 CPU、Node 主版本与 libc；macOS 构建产物不能直接部署到 Linux。优先在目标机或兼容 Linux 构建环境构建。`NEXT_PUBLIC_*` 直接用于客户端代码时会在构建时内联；当前投稿页动态读取 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 并在运行时传给客户端。认证、数据库、R2 Secret 等始终在运行时提供，修改后重启。

## 目录与环境

建议：

```text
/opt/ahau-photo-archive/releases/version-001/  # dist/native 内容
/opt/ahau-photo-archive/current -> releases/version-001
/var/lib/ahau-photo-archive/archive.db            # 主库与 WAL/SHM
/var/lib/ahau-photo-archive/bootstrap/            # 生成的密钥与初始凭据
/var/lib/ahau-photo-archive/storage/              # local 模式
/var/backups/ahau-photo-archive/                  # SQLite 在线备份
/etc/ahau-photo-archive/app.env                   # 运行时变量
```

管理员在 Linux 上准备独立低权限用户和目录，不要在开发机器上执行：

```bash
sudo useradd --system --home-dir /var/lib/ahau-photo-archive --shell /usr/sbin/nologin ahau-archive
sudo install -d -o root -g root -m 0755 /opt/ahau-photo-archive/releases
sudo install -d -o ahau-archive -g ahau-archive -m 0700 /var/lib/ahau-photo-archive /var/backups/ahau-photo-archive
sudo install -d -o root -g ahau-archive -m 0750 /etc/ahau-photo-archive
sudo install -o root -g ahau-archive -m 0640 /dev/null /etc/ahau-photo-archive/app.env
```

新版本 release 由 root 持有、应用用户只读；仅 `.next/cache` 可按需赋予应用用户写权限。数据、环境文件和备份始终在 release 外，绝不经 HTTP 静态服务。SQLite 所在目录必须允许应用用户创建主文件/WAL/SHM，本地图片目录由 Bootstrap 建立，备份目录需可写。不要使用 `chmod 777` 或递归改动已有照片权限。

`app.env` 使用 systemd `EnvironmentFile` 的 `KEY=value` 格式，不加 `export`。至少设置真实公开 HTTPS `BETTER_AUTH_URL`、生产 Turnstile Site Key/Secret，以及数据库和备份路径：

```ini
DATABASE_PATH=/var/lib/ahau-photo-archive/archive.db
BACKUP_DIR=/var/backups/ahau-photo-archive
LOCAL_STORAGE_PATH=/var/lib/ahau-photo-archive/storage
BETTER_AUTH_URL=https://你的实际公开域名
BETTER_AUTH_SECRET=
STORAGE_DRIVER=local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=生产站点密钥
TURNSTILE_SECRET_KEY=生产服务端密钥
ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_PASSWORD=
ADMIN_BOOTSTRAP_NAME=Administrator
RATE_LIMIT_SECRET=
```

全新数据库可留空 `BETTER_AUTH_SECRET`，系统在持久目录安全生成；已有部署必须保持原密钥，丢失时拒绝启动。可填初始管理员邮箱/密码，留空密码则生成随机值。`STORAGE_DRIVER=r2` 时再提供 `.env.example` 中的 R2 变量，默认 `R2_AUTO_CREATE_BUCKETS=false`；缺配置或桶权限不足会阻止启动，绝不自动回退。R2 桶的自定义公开域名和私有访问策略仍需人工配置。`TRUSTED_PROXY_IP_HEADER` 默认留空；代理只有在不可绕过且会剥离、重写同名头时才可启用。代理需保持正确 Host/Origin、限制 52 MiB 投稿体并配置上传超时。项目数据库变量是 `DATABASE_PATH`，没有 `DATABASE_URL`。

## 首次启动与日常操作

将兼容 Linux 构建包解压到新的 `releases/version-001`，确认 `build-info.json`、文件所有权和 Node 绝对路径。服务模板 `NODE_BIN=/usr/bin/node`；如果 Node 安装在别处，按 `command -v node` 修改模板的 `NODE_BIN`，不依赖 nvm 或个人 Shell。随后由管理员安装服务：

```bash
sudo ln -s releases/version-001 /opt/ahau-photo-archive/current
sudo install -o root -g root -m 0644 deploy/systemd/ahau-photo-archive.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ahau-photo-archive.service
sudo systemctl status ahau-photo-archive.service
curl --fail --silent http://127.0.0.1:3000/api/health
```

`systemctl start ahau-photo-archive` 即自动检查环境、创建 SQLite/存储、备份并迁移旧库、创建首个管理员，然后执行 `node server.js`。初始化失败时服务不会启动。服务默认以 `ahau-archive` 用户监听 `127.0.0.1:3000`，`Restart=on-failure`、5 秒重试、SIGTERM 最多等待 30 秒；stdout/stderr 进入 journald。`NoNewPrivileges`、`PrivateTmp`、`ProtectHome`、`ProtectSystem=full`、`UMask=0077` 生效。外部反向代理若不在本机，只能明确改监听地址并限制防火墙/私网 ACL，不得直接公开管理端口。健康接口仅检查 SQLite；还需经真实 HTTPS 域名验收 Cookie、登录/退出、投稿、审核与图片。

```bash
sudo systemctl start ahau-photo-archive.service
sudo systemctl stop ahau-photo-archive.service
sudo systemctl restart ahau-photo-archive.service
sudo systemctl status ahau-photo-archive.service
sudo journalctl -u ahau-photo-archive.service -n 100 --no-pager
```

随机初始密码须在可信终端以应用用户运行 `migrations/scripts/admin-credentials.mjs` 领取；具体 `systemd-run --pty` 命令见[初始化指南](initialization.md)。首次登录必须在 `/admin/settings` 修改密码。源代码工具 `pnpm db:migrate` 和 `pnpm admin:init` 仍保留用于维护，但正常部署无需执行。临时调试可停正式服务后在已加载相同环境的终端运行 `node server.js`；直接运行没有进程管理或自动 Bootstrap。

## 更新、备份、恢复与回滚

新版本始终解压到新的 `releases/version-*`，保留旧版。更新前记录旧版、核对新旧 Schema 兼容性，并用当前版本的共用脚本在线备份：

```bash
sudo systemd-run --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/current -p EnvironmentFile=/etc/ahau-photo-archive/app.env /usr/bin/node /opt/ahau-photo-archive/current/migrations/scripts/backup-db.mjs
```

然后停服务、原子切换 symlink、启动新版本；新版本 Bootstrap 如有待执行 Migration，会再做一致性备份，失败则不会提供 HTTP：

```bash
sudo systemctl stop ahau-photo-archive.service
sudo ln -s releases/version-002 /opt/ahau-photo-archive/current.next
sudo mv -Tf /opt/ahau-photo-archive/current.next /opt/ahau-photo-archive/current
sudo systemctl start ahau-photo-archive.service
curl --fail --silent http://127.0.0.1:3000/api/health
```

SQLite 在线备份包含已提交 WAL，备份后校验且文件权限为 0600。定期复制到异地；同机备份不足以应对主机故障。local 照片和 R2 对象另行保护。代码 symlink 回滚不等于 Schema 回滚；旧版不兼容新 Schema 时，先停服务、核对图片版本，再显式恢复迁移前备份，接受恢复点之后的数据损失。恢复命令：

```bash
sudo systemctl stop ahau-photo-archive.service
sudo systemd-run --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/current -p EnvironmentFile=/etc/ahau-photo-archive/app.env -p Environment=RESTORE_CONFIRM=YES /usr/bin/node /opt/ahau-photo-archive/current/migrations/scripts/restore-db.mjs archive-YYYY-MM-DDTHH-MM-SS-sssZ-UUID.sqlite
```

忘记管理员密码时，用同样的可信本地 TTY 命令调用 `migrations/admin-recover.cjs`，再领取新随机密码。恢复数据库和图片一致性后才重新启动网站；恢复程序不会自动运行。

## 排障与环境限制

通过 `journalctl` 检查初始化失败：数据目录/卷写权限、磁盘空间、备份目录、认证密钥指纹、真实 Turnstile、R2 桶和公开域名。无需为本地存储提供 R2 凭据。不要删除已有 SQLite、`bootstrap/` 或照片来绕过错误。macOS 只能验证包结构和应用流程，无法证明目标 Linux systemd、原生模块与真实代理运行正常。
