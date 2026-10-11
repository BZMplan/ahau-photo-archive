# 自动初始化与管理员账户

Docker Compose 的 `app` 容器和原生 systemd 服务都执行同一个 `start-production.sh`：先运行打包的 `BootstrapService`，成功后用 `exec node server.js` 启动 Next.js。Bootstrap 只在进程启动前运行，不由页面或 HTTP 请求触发。失败时脚本非零退出、健康检查不会就绪。首次启动、重复启动和中断后重试使用同一流程。

## 首次启动执行的步骤

1. 在 `DATABASE_PATH` 同级的 `bootstrap/` 创建 0700 目录。校验 `BETTER_AUTH_URL` 和认证密钥。显式提供的 `BETTER_AUTH_SECRET` 优先；首次新库未提供时生成高熵密钥到 `bootstrap/better-auth-secret`（0600）。`auth-secret-state.json` 保存密钥指纹；后续密钥缺失或不匹配时拒绝启动，避免意外轮换和 Session 失效。已有数据库第一次升级时仍需提供其原有 `BETTER_AUTH_SECRET`。
2. 验证生产 Turnstile 配置。创建 SQLite 目录和文件，检查已有数据库完整性。比较已提交 `drizzle/` journal 与 `__drizzle_migrations`；仅在有待执行 Migration 时调用现有 Drizzle migrator。已有库升级前先用共用的 SQLite Backup API 脚本生成一致性备份并检查；备份失败就停止。首次无库不需要备份。不会清空业务表、投稿、审核日志或 Session。
3. `STORAGE_DRIVER` 默认 `local`：在 `LOCAL_STORAGE_PATH` 或数据库同级的 `storage/` 下创建 `private/` 和 `public/`，检查可写性，不删除已有对象。私有目录从不静态公开；公开照片仍由既有批准条件控制。目录或卷不可写、路径被文件占用时启动失败。权限由部署用户与卷配置负责，不递归改权限。
4. `STORAGE_DRIVER=r2`：校验现有 R2 变量，逐个 `HeadBucket`、少量列表读及未完成 multipart 上传/立即中止，检查两个桶的访问与对象写权限。探测不产生公开对象。默认 `R2_AUTO_CREATE_BUCKETS=false`；设为 `true` 才在确认为 404 时尝试官方 S3 `CreateBucket`，无创建权限则失败。创建桶不会自动配置公开自定义域名或私有访问策略；需由维护者在 Cloudflare 配置和验证。R2 错误绝不回退到 local。
5. 检查 `user`、`session`、`account`、`verification` 等认证表，然后在 SQLite `BEGIN IMMEDIATE` 事务内检查持久 `bootstrap_state` 与管理员。已有管理员不创建、不改邮箱、名称或密码。首次没有管理员且未初始化过时，使用 Better Auth Admin Plugin 的服务端 `createUser` 建立真实 `admin` 角色。事务和唯一邮箱约束阻止并发重复创建。若已初始化过却没有管理员，则拒绝自动替补，要求本地恢复。

## 初始管理员与凭据

首次创建时读取一次 `ADMIN_BOOTSTRAP_EMAIL`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_NAME`。缺省邮箱为 `admin@localhost.invalid`，名称为 `Administrator`；缺省密码由安全随机数生成。显式密码要求 12–128 字符且含字母和数字。环境变量只参与**首次创建**，之后重启不会把后台更改恢复成旧值。

随机密码写入数据库目录下 `bootstrap/admin-credentials`（0600），不进入 HTTP、普通日志、镜像或 Git。Docker 在可信 TTY 执行：

```bash
docker compose --env-file .env.production exec app node migrations/scripts/admin-credentials.mjs
```

原生 Linux 在本地终端、以应用用户运行（用目标服务器实际 Node 绝对路径）：

```bash
sudo systemd-run --pty --wait --collect -p User=ahau-archive -p Group=ahau-archive -p WorkingDirectory=/opt/ahau-photo-archive/current -p EnvironmentFile=/etc/ahau-photo-archive/app.env /usr/bin/node /opt/ahau-photo-archive/current/migrations/scripts/admin-credentials.mjs
```

自动生成密码的账户首次登录后只能访问 `/admin/settings` 的修改密码功能；其它管理员页面和 API 服务端拒绝。输入当前密码和新密码后，Better Auth 的 `changePassword` 哈希新密码并撤销其他 Session，当前浏览器重新登录；随后解除门禁并删除初始凭据文件。显式配置的密码不会生成领取文件，但仍建议首次登录后更换，并从部署环境中删除 `ADMIN_BOOTSTRAP_PASSWORD`。

## 日常账户设置与恢复

后台“账户设置”只操作当前 Session 的管理员。显示名称通过 Better Auth `updateUser` 修改。邮箱更改要求再次校验当前密码，并且新邮箱不能重复；当前项目没有邮件服务，不会声称邮箱已验证，更新后 `email_verified=false`。旧邮箱不能再登录。密码更改要求当前密码、新密码及确认值，使用 Better Auth `changePassword`，撤销其它 Session 并要求重新登录。所有写请求检查 Origin、管理员 Session 和 Zod 输入，不接受客户端提供的用户 ID 或角色。若将来启用邮件服务，应重新设计邮箱验证流程。

遗忘密码时只能在可信服务器 TTY 运行本地恢复程序，它要求输入**现有管理员邮箱**，生成新随机密码，使用 Better Auth 官方密码哈希、撤销 Session、重新启用首次改密门禁，并写入受保护凭据文件。Docker：

```bash
docker compose --env-file .env.production exec app node migrations/admin-recover.cjs
```

原生部署：将上节 `systemd-run` 命令末尾的 `admin-credentials.mjs` 改为 `migrations/admin-recover.cjs`。恢复后再用领取命令读取新密码。无需也不得开放匿名重置接口。若数据库中管理员记录已被删除，本恢复工具不会自动创建替代账户，应由维护者从受核对的备份恢复。

## 升级、备份与故障处理

正常首次启动不用运行 `db:migrate` 或 `admin:init`。源码维护命令仍保留。更新时先保存当前版本和数据库备份；启动新版本时若有新 Migration，会再次在线备份然后迁移。单机备份不替代异地备份，R2/local 图片需要分别保护。应用代码回滚不等于 Schema 回滚，恢复前应停止写入并核对数据库及图片版本。

启动失败先看 Docker 日志或 `journalctl`：检查数据目录/卷权限、磁盘空间、数据库完整性、备份目录权限、认证密钥指纹、Turnstile 真实密钥与 R2 桶权限。失败后可修复环境并重启；已完成的迁移和管理员创建会被识别并跳过。不要删除 `bootstrap/`、SQLite 主文件/WAL/SHM 或照片来“重新初始化”。
