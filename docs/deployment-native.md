# 原生 Linux 部署：Node.js Standalone + systemd

这是与 [Docker Compose 部署](deployment.md)并列的单实例部署方式。应用、Drizzle SQL、SQLite 在线备份/恢复、R2 和 Turnstile 与容器方式相同。项目不管理外部 HTTPS 反向代理或 TLS。以下命令由服务器管理员审阅后执行；不要在开发机上创建生产目录或安装服务。

## 平台与构建

推荐 Debian 12 或 Ubuntu 24.04 的 Linux x64/arm64，使用 Node.js 24（项目 `.node-version` 为 24，`engines` 允许 24–26）。构建环境使用 `package.json` 固定的 pnpm 12.10.1；**已打包的应用和数据库工具只需 Node.js，无需 pnpm、Docker、Drizzle Kit 或 TypeScript**。请在目标 Linux 机器或相同 CPU 架构、Node 主版本及 libc（glibc/musl）的兼容 Linux 构建机上执行：

```bash
pnpm install --frozen-lockfile
pnpm build:native
```

`build:native` 先编译现有 Drizzle 迁移入口，再执行 Next.js `output: "standalone"` 生产构建，最后生成 `dist/native/`。其中有 `server.js`、已追踪的精简 `node_modules`、`.next/static`、`public`、`migrations/`（编译后的迁移及备份/恢复/检查程序与最少运行依赖）、`drizzle/`（原 SQL 和 journal）及 `build-info.json`。可自行在兼容 Linux 构建机将 `dist/native` 制成 tar 包并传输；解压时保留目录、权限和符号链接。不要把源代码树、`.env*`、数据库、备份、照片或完整开发依赖一起打包。脚本会拒绝发现这些数据。`build-info.json` 记录构建 Node、平台、架构和 libc；部署前与目标机器核对。

Sharp 和 better-sqlite3 有原生模块。macOS 打包产物仅用于 macOS 本地验证，**不可**直接复制到 Linux。Linux x64 与 arm64、glibc 与 musl 也不能随意混用。推荐目标机或兼容 Debian/Ubuntu 构建机；Node 可执行文件及原生模块必须与目标环境兼容。构建时不需要生产密钥，构建机不要放真实 `.env`。Next.js 一般会把客户端代码中的 `NEXT_PUBLIC_*` 在构建时内联；本项目投稿页在动态服务端页面以计算属性读取 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 并传给客户端，当前可在运行时设置。改成客户端直接读取或静态渲染时须重新评估并按域名重新构建。`BETTER_AUTH_URL`、认证/R2/Turnstile Secret、数据库和存储路径均在运行时提供，修改后重启服务。切勿把 Secret 放入 `NEXT_PUBLIC_*` 或 `next.config.ts` 的 `env`。

## 目录、账户与配置

建议：

```text
/opt/ahau-photo-archive/releases/version-001/    # dist/native 的内容；只读版本
/opt/ahau-photo-archive/current -> releases/version-001
/var/lib/ahau-photo-archive/archive.db              # 主库及 -wal/-shm
/var/lib/ahau-photo-archive/storage/                # 仅 STORAGE_DRIVER=local
/var/backups/ahau-photo-archive/                    # 在线备份
/etc/ahau-photo-archive/app.env                     # 运行时变量
```

在 Linux 管理终端创建独立用户和目录，例如：

```bash
sudo useradd --system --home-dir /var/lib/ahau-photo-archive --shell /usr/sbin/nologin ahau-archive
sudo install -d -o root -g root -m 0755 /opt/ahau-photo-archive/releases
sudo install -d -o ahau-archive -g ahau-archive -m 0700 /var/lib/ahau-photo-archive /var/backups/ahau-photo-archive
sudo install -d -o root -g ahau-archive -m 0750 /etc/ahau-photo-archive
sudo install -o root -g ahau-archive -m 0640 /dev/null /etc/ahau-photo-archive/app.env
```

将兼容 Linux 构建产物放入一个**新的** `releases/version-*` 目录，设为 `root:root` 且可由应用用户读取；仅为 Next.js 的临时缓存准备可写目录（例如 `sudo install -d -o ahau-archive -g ahau-archive -m 0700 /opt/ahau-photo-archive/releases/version-001/.next/cache`）。不同版本共享 `/var/lib`。数据和配置不在可由 HTTP 静态服务的 `public/` 下，也不在 `releases/` 下。SQLite 所在目录必须可写，以便创建主文件、WAL、SHM；本地图片目录也应仅供应用用户写入。备份目录 0700，备份文件 0600。R2 模式仍须独立保护 R2 原图和公开对象。

`app.env` 采用 systemd `EnvironmentFile` 的 `KEY=value` 格式，**不要**加 `export`。可参考 `.env.example` 填写实际值，示意：

```ini
DATABASE_PATH=/var/lib/ahau-photo-archive/archive.db
BACKUP_DIR=/var/backups/ahau-photo-archive
LOCAL_STORAGE_PATH=/var/lib/ahau-photo-archive/storage
BETTER_AUTH_URL=https://你的实际公开域名
BETTER_AUTH_SECRET=实际随机密钥
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=实际值
R2_ACCESS_KEY_ID=实际值
R2_SECRET_ACCESS_KEY=实际值
R2_PRIVATE_BUCKET=实际私有桶
R2_PUBLIC_BUCKET=实际公开桶
R2_PUBLIC_BASE_URL=https://实际公开图片域名
NEXT_PUBLIC_TURNSTILE_SITE_KEY=实际生产站点密钥
TURNSTILE_SECRET_KEY=实际生产服务端密钥
RATE_LIMIT_SECRET=另一独立随机密钥
TRUSTED_PROXY_IP_HEADER=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_CACHE_PURGE_TOKEN=
```

服务模板已设置 `NODE_ENV=production`、`HOSTNAME=127.0.0.1`、`PORT=3000`，可在 env 文件中明确覆盖。项目数据库变量实际是 `DATABASE_PATH`，没有 `DATABASE_URL`。生产认证 URL 必须是公网 HTTPS origin；无默认域名。`STORAGE_DRIVER=local` 时图片保存在上述持久目录；`r2` 使用现有 Adapter，不会回退到 local。生产必须使用真实 Turnstile 密钥，不接受官方测试密钥。无 Cloudflare purge 配置时撤回的 CDN 清除状态会记录为未配置；有配置时失败任务也会保留。`TRUSTED_PROXY_IP_HEADER` 默认留空；只有代理入口不可绕过且剥离并重写该头时才设置。

环境文件权限保持 `root:ahau-archive 0640`，目录 `0750`，不要让普通用户读取。密钥不得出现在 release、Git、命令参数或 HTTP 输出中。`BETTER_AUTH_URL`、Host、Origin 和 Secure Cookie 规则与 Docker 相同。外部代理应只接入回环监听，转发正确 Host/Origin，限制 52 MiB 投稿请求并提供足够上传/处理超时。如代理在远端，须明确修改 `HOSTNAME` 并用防火墙/私网 ACL 只允许可信代理访问端口；不要直接暴露公网。应用不无条件信任 `X-Forwarded-*`。

## 首次启动与管理员

下面假设新版本已解压在 `/opt/ahau-photo-archive/releases/version-001`。先核对 `build-info.json`、Node 路径、运行依赖和配置。模板中的 `/usr/bin/node` 是常见路径；如果系统不同，用 `command -v node` 找到绝对路径后编辑**两个** `ExecStart`/`ExecStartPre` 路径，不依赖 nvm 或交互 Shell 的 `PATH`。

使用与服务相同的账户和 EnvironmentFile 显式执行迁移；这是首次建库的操作，也可用于更新。以下 `systemd-run` 命令以短暂的临时 unit 加载配置，不安装或启动正式网站服务：

```bash
sudo systemd-run --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/releases/version-001 -p EnvironmentFile=/etc/ahau-photo-archive/app.env /usr/bin/node /opt/ahau-photo-archive/releases/version-001/migrations/scripts/migrate.js
```

若已有生产库，**先备份，再迁移**；迁移失败不要切换 `current` 或重启新版本。迁移仍使用 `drizzle/` 中同一套已提交 SQL；源码运维可继续用 `pnpm db:migrate`，不可用 `push` 代替。没有历史管理员时，一次性从同版本的**可信源码 checkout**（安装 pnpm 和依赖的运维环境，能访问同一数据库）执行 `pnpm admin:init`，通过本地交互 TTY 输入密码。例如把源码放在 `/opt/ahau-photo-archive/source`，确认应用用户可读，并将以下 `/usr/bin/pnpm` 改为实际的绝对路径：

```bash
sudo systemd-run --pty --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/source -p EnvironmentFile=/etc/ahau-photo-archive/app.env /usr/bin/pnpm admin:init
```

初始化脚本检查已有管理员并调用 Better Auth 官方 CLI；Standalone 产物不包含该开发工具。完成后可移除临时源码和开发依赖。运行网站本身不需要 pnpm，也不会在启动时创建管理员。

确认迁移及管理员后再切换符号链接并安装模板：

```bash
sudo ln -s releases/version-001 /opt/ahau-photo-archive/current
sudo install -o root -g root -m 0644 deploy/systemd/ahau-photo-archive.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ahau-photo-archive.service
sudo systemctl status ahau-photo-archive.service
curl --fail --silent http://127.0.0.1:3000/api/health
```

`systemd` 以低权限 `ahau-archive` 运行，先只读检查 Migration，再执行 `node server.js`；失败会退出并由 `Restart=on-failure` 在 5 秒后重试。它监听本机 3000，SIGTERM 停止等待最多 30 秒，stdout/stderr 进入 journald。`NoNewPrivileges`、`PrivateTmp`、`ProtectHome`、`ProtectSystem=full` 和 `UMask=0077` 限制进程；应用数据和缓存写入须检查权限。启用/调整 journald 保留和磁盘配额属于主机运维。

```bash
sudo systemctl start ahau-photo-archive.service
sudo systemctl stop ahau-photo-archive.service
sudo systemctl restart ahau-photo-archive.service
sudo systemctl status ahau-photo-archive.service
sudo journalctl -u ahau-photo-archive.service -n 100 --no-pager
```

临时排障可在已加载相同环境的可信终端进入 `current` 并运行 `node server.js`，先停止正式服务，避免两个进程同时服务同一端口/SQLite。直接运行没有进程管理。健康接口仅检查 SQLite，正常 200/`ok`，失败 503，不检查 R2。还须经真实 HTTPS 域名验证登录/退出、Cookie、Session、匿名投稿的真实 Turnstile、私有预览权限和公开图片。

## 更新、备份与回滚

每次更新在兼容 Linux 环境构建新包，解压到新的 `releases/version-*`，保留旧版本。核对运行配置后，在**当前**版本和当前数据库上执行 SQLite 在线备份：

```bash
sudo systemd-run --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/current -p EnvironmentFile=/etc/ahau-photo-archive/app.env /usr/bin/node /opt/ahau-photo-archive/current/migrations/scripts/backup-db.mjs
```

该脚本使用 SQLite Backup API 纳入已提交 WAL 页面，生成带时间及随机 ID 的独立文件，做 `quick_check`，失败非零退出；不能只复制正在写入的主库。同机备份不能代替异地备份，local 图片需另备份持久存储，R2 对象需另有保护。记录本次数据库备份名和旧版本路径。随后停止旧服务，在新版本目录执行上节的 `migrate.js`，成功后切换 `current` 并重启：

```bash
sudo systemctl stop ahau-photo-archive.service
# 以新版本目录和相同 EnvironmentFile 执行 migrate.js，成功才继续
sudo ln -s releases/version-002 /opt/ahau-photo-archive/current.next
sudo mv -Tf /opt/ahau-photo-archive/current.next /opt/ahau-photo-archive/current
sudo systemctl restart ahau-photo-archive.service
curl --fail --silent http://127.0.0.1:3000/api/health
```

`mv -T` 适用于推荐的 GNU/Linux。检查 journald 与公网关键流程。保留少量旧 release；清理时只删除明确不再使用的旧版本，不触碰 `/var/lib`、`/etc`、`/var/backups`。代码回滚只在旧版本兼容已迁移 Schema 时可切换 symlink 后重启。否则先停服务，核对备份和 R2/local 图片版本，再显式恢复迁移前备份，最后切换旧版本。恢复点以后的投稿、审核和 Session 会丢失，不自动回滚 Schema。

恢复必须由管理员在停止所有写入进程后执行。先列出备份目录并确认文件名，再使用同一备份/恢复脚本：

```bash
sudo systemctl stop ahau-photo-archive.service
sudo systemd-run --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/current -p EnvironmentFile=/etc/ahau-photo-archive/app.env -p Environment=RESTORE_CONFIRM=YES /usr/bin/node /opt/ahau-photo-archive/current/migrations/scripts/restore-db.mjs archive-YYYY-MM-DDTHH-MM-SS-sssZ-UUID.sqlite
```

恢复先做完整性与业务表检查，再在线备份当前库、检查 WAL checkpoint，替换主库并移除旧 WAL/SHM；失败返回非零。人工核对恢复后的 Schema 与图片对象，确认后启动服务。不要在服务运行时恢复。

## 故障排查

| 现象                        | 检查                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `status` 反复重启           | `journalctl`、EnvironmentFile 权限/语法、`ExecStartPre` 的 Migration 版本、数据库目录权限。       |
| SQLite 打不开               | `DATABASE_PATH` 是绝对路径、数据目录可写、磁盘容量和 WAL/SHM 权限；单实例且不用共享网络文件系统。 |
| Sharp / SQLite 模块加载失败 | `build-info.json` 与目标 Node 主版本、CPU、Linux libc 对比；在兼容 Linux 构建环境重新安装并打包。 |
| 静态资源 404                | 确认 release 中存在 `public/`、`.next/static/` 和匹配的 `server.js`。                             |
| 登录/Cookie 异常            | 确认公开 HTTPS `BETTER_AUTH_URL`、代理 Host/Origin、Secure Cookie 和时间；保留 CSRF/权限检查。    |
| Turnstile/R2 失败           | 核对生产站点域名、Siteverify、运行时密钥、R2 桶策略；不要用测试密钥或放开私有原图。               |
| 上传 413/超时               | 核对外部代理请求体和超时、应用 52 MiB 请求及图片处理限制。                                        |

本机若不是 Linux/systemd，只能做构建结构和脚本静态验证；真实 systemd、原生模块、代理、R2、Turnstile、浏览器流程须在目标 Linux 环境验收。
