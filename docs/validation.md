# 历次验证记录

文档保留各阶段的历史结果；当前第七阶段的结果如下。早期条目中的 501 仅表示当时功能尚未开放，不代表当前投稿或审核接口行为。

## 第七阶段：Docker 容器化部署与生产环境配置

验证日期：2026-10-11。使用独立 Compose 项目、隔离的 SQLite / 备份命名卷、LocalStorage 和非真实 Turnstile 测试值；没有接触开发或生产数据库、真实照片、Cloudflare R2/CDN 或正式反向代理。宿主机为 macOS arm64，镜像为 Node.js 24 Debian slim Linux arm64。

- `pnpm check`：TypeScript、Prettier、22 项 Node 测试、99 项 Vitest 通过；ESLint 0 错误，后台既有 5 条 `<img>` 警告。
- `pnpm build`、`pnpm db:compile`、`pnpm db:generate`：通过，无新 Schema 差异。`pnpm test:auth-flow`：9 项真实 standalone HTTP 回归通过。
- `docker compose config`、`docker compose build app admin-init`：通过。默认仅 `app` 长期运行，映射 `127.0.0.1`，无 privileged 或 Docker Socket。Runner 镜像未发现 `.env`、SQLite、上传、测试目录，`/app/data` 和 `/app/backups` 属于 UID 1000。
- 容器显式 Migration 首次和重复执行通过，启动门槛拒绝未迁移数据库，已迁移应用为 healthy。Linux Runner 内 `better-sqlite3`、Sharp 均可加载；首页、档案、投稿页、健康接口可访问。投稿页显示运行时 Site Key；匿名管理员 API 返回 401，错误 Origin 投稿返回 403。
- 向隔离数据库和 local 存储写入探针，容器 restart 和 force-recreate 后均保留。容器在线备份成功，新备份为无 WAL/SHM 附属文件的单个 SQLite 文件；停止应用后恢复备份，并核对探针数据回到恢复点；备份/恢复临时库测试也通过。
- 临时 `admin-init` 容器在可信 TTY 中调用官方 CLI 创建了**仅在隔离测试卷中的测试管理员**，无默认密码；再次初始化正确拒绝。Runner 对官方 Turnstile 测试 Secret Key 拒绝启动。

未验证真实 HTTPS 反向代理、真实 R2/Turnstile/CDN、生产域名 Cookie、跨架构镜像或浏览器视觉交互；这些需在部署者自己的外部环境另行验收。隔离测试 Docker 卷只包含程序生成的数据，不是开发或生产卷。

验证日期：2026-10-11。开发环境为 macOS arm64、Node.js 26.11.1、pnpm 12.10.1；Docker 使用 Node.js 24 的 Linux arm64 镜像。未创建真实密钥或调用 Cloudflare 服务。

## 命令验证

| 命令                                            | 结果                                                |
| ----------------------------------------------- | --------------------------------------------------- |
| `pnpm install --frozen-lockfile`                | 通过，可按 lockfile 安装                            |
| `pnpm db:generate`                              | 生成五张业务表的初始 SQL Migration                  |
| `pnpm db:migrate`                               | 通过，首次和重复执行均成功                          |
| `pnpm typecheck`                                | 通过，严格类型与 App Router 路由类型检查            |
| `pnpm lint`                                     | 通过，无错误或警告                                  |
| `pnpm format:check`                             | 通过                                                |
| `pnpm test`                                     | 六项集成测试通过                                    |
| `pnpm check`                                    | 类型、Lint、格式和测试通过                          |
| `pnpm db:compile`                               | 通过，编译后的迁移脚本也实际执行成功                |
| `pnpm build`                                    | 通过，最终构建无目录追踪警告                        |
| `pnpm dev --hostname 127.0.0.1`                 | 成功启动，页面实际响应正常                          |
| `PORT=3101 pnpm start`                          | standalone 本地生产服务启动成功，静态资源实际可访问 |
| `docker compose config --quiet`                 | 配置解析通过                                        |
| `docker compose build`                          | Linux 镜像构建成功                                  |
| `docker compose up -d --wait --wait-timeout 60` | 最终镜像启动成功，服务为 healthy                    |

容器已实际启动，日志显示 `Database migrations applied.` 和 Next.js `Ready`。运行用户为 `node`（UID 1000），健康检查为 `healthy`；数据保存在命名卷，重启后迁移仍可重复执行。

## 数据与权限边界

六项测试使用自动清理的临时数据库，默认开发数据库没有填入演示内容：

1. Migration 重复执行、UUID 生成与外键启用。
2. 非法审核状态、缺少公开资源的批准记录、孤立照片均被拒绝。
3. 公开查询排除 pending / rejected / hidden，隐藏后不可查询；结果无联系方式或对象 Key。
4. 标签关联唯一，审核历史阻止照片硬删除。
5. 管理员 API 返回 401，投稿返回 501。
6. R2、Sharp、Turnstile 预留模块明确失败，不模拟成功。

最终 standalone 输出检查未发现数据库、上传目录、环境文件或测试代码。Docker 构建上下文同样排除运行数据与环境文件。

## HTTP 验证

开发、本地生产和 Docker 服务均验证了以下响应：

| 请求                                                                        | 预期和实际状态 |
| --------------------------------------------------------------------------- | -------------- |
| `/`、`/submit`、`/admin/login`、`/admin`、`/admin/reviews`、`/admin/photos` | 200            |
| 不存在的 `/photo/[id]`                                                      | 404            |
| `GET /api/health`                                                           | 200            |
| `GET /api/admin/photos`                                                     | 401            |
| `POST /api/submissions`                                                     | 501            |

生产环境首页中的 11 个 JS/CSS 资源均返回 200。HTML 包含真实空状态和表单禁用标记。公开详情的有效记录和非公开记录隔离由临时数据库集成测试覆盖。

## 浏览器检查限制

浏览器安全策略拒绝访问本地项目地址，原因为该请求未获用户许可。没有尝试绕过。因此未执行浏览器截图、主题按钮点击、移动视口和控制台检查；不能将 HTTP/静态源码检查视为这些检查已通过。

React 源码检查确认客户端边界集中于主题和错误重试，表单字段有标签，按钮有名称，列表使用稳定 ID，未使用第三方随机图片或客户端数据库访问。实际视觉与主题交互仍建议在允许访问的浏览器中复核。

## 第四阶段：匿名投稿

验证日期：2026-10-11。投稿测试使用临时 SQLite、LocalStorage、程序生成图片和注入的 Turnstile Siteverify 响应；没有调用真实 Cloudflare 或 R2，没有写入开发数据库照片。

- `pnpm db:generate`：无额外 Schema 差异；`pnpm db:migrate`：新增投稿字段、`submission_operations` 和 `submission_rate_limits` 迁移可重复执行。
- `pnpm test:images`：6 个 Vitest 文件、75 项测试通过；包含 1/2 张真实投稿、pending 状态、私有文件、公开 Key 为空、元数据顺序、requestId 幂等、小时/日限流、Turnstile 拒绝、Origin 拒绝和路由错误响应。
- `pnpm test`：原有 19 项业务/认证/迁移测试全部通过；旧库迁移测试使用历史列清单，确认新增字段不破坏旧业务记录。
- `pnpm lint`、`pnpm typecheck`、`pnpm exec prettier --check .`：通过。
- `pnpm build`：Next.js 生产构建通过，`/submit` 为静态页面，`/api/submissions` 为 Node 动态 Route Handler。
- `pnpm test:auth-flow`：生产 standalone 认证、私有预览、公开状态门禁及 R2 缺配置回归 8 项通过。
- `pnpm storage:check`：第三阶段 local 存储探测继续通过；投稿不会调用公开存储。

失败补偿使用真实 ImageService 和临时存储测试；中途文件失败、数据库事务失败、清理失败记录和重试状态由服务单元测试覆盖。真实浏览器拖拽体验、真实 Turnstile Challenge、反向代理 body limit、真实 R2 权限及 CDN 尚未执行；这些需要本地浏览器或维护者配置的外部环境。

## 第三阶段：图片存储与处理

验证日期：2026-10-11。以下检查使用本地存储、程序生成的图片以及隔离的临时数据库/目录；R2 请求通过 SDK mock 验证，没有调用真实 Cloudflare API。

- `pnpm install --frozen-lockfile`、`pnpm peers check`：通过，无 peer 问题。
- `pnpm check`：TypeScript、ESLint、Prettier、原有 19 项测试及新增 67 项 Vitest 测试全部通过。
- `pnpm build`：生产构建通过；检查 standalone 没有应用环境文件、数据库、上传/存储数据或测试目录。
- `pnpm test:auth-flow`：真实生产 standalone 服务 8 项通过；包括认证回归、私有预览、本地公开图片状态门禁，以及 R2 缺凭据启动失败。
- `AHAU_TEST_SERVER_MODE=development pnpm test:auth-flow`：开发服务 6 项通过，2 项仅生产启动用例跳过。
- `pnpm db:generate`：无 Schema 差异；`pnpm db:migrate`：应用新迁移并重复执行通过。
- `pnpm db:compile`：通过，编译后的迁移脚本在临时数据库连续执行两次成功。
- `pnpm storage:check`：当前 local 模式私有写入、逐字节读取比较、删除及重复删除通过，没有创建照片数据库记录或公开对象。
- `docker compose config --quiet`：临时进程配置验证通过；未构建或运行 Docker 镜像。
- `git diff --check`：通过；0000 / 0001 历史迁移未修改。

Vitest 覆盖 JPEG / PNG / WebP 实际识别、非法与损坏文件、10 MiB 和像素/单边限制、元数据、横竖缩放、小图不放大、EXIF 方向、WebP 变体及元数据移除；适配器隔离、路径遍历/符号链接、条件写入与幂等删除；R2 参数、限量下载及安全错误映射。ImageService 集成测试使用真实 Better Auth 与临时 SQLite，验证伪造身份拒绝、原图不可覆盖、重复发布、部分上传失败补偿、清理失败持久记录、日志写入失败、数据库事务失败补偿以及服务重建后的显式恢复。

实际 HTTP 检查证明：匿名预览 401、普通用户预览 403、管理员私有 WebP 返回 no-store、错误或缺失照片 404；待审核/隐藏照片不能由本地公开路由读取，只有数据库发布状态完整的已批准衍生图可读取。查询参数不能替换私有 Key，原图及存储目录不能通过静态路由访问。

真实 R2 连接、权限策略、自定义域名、CDN 清理与生产部署未验证，需要维护者配置后独立验证。没有执行浏览器视觉或 JavaScript 交互测试。本阶段未创建真实照片、生产测试账号或密钥；没有公开上传/发布/删除接口，也没有开发完整投稿或审核业务。

## 第二阶段：管理员认证

验证日期：2026-10-11，同一开发环境。以下是认证实现后的结果，第一阶段的公开后台预览行为已被服务端保护替代。

## 命令与数据

- `pnpm install --frozen-lockfile`：通过；`pnpm peers check`：无 peer 问题。
- `pnpm check`：严格类型、ESLint、Prettier、19 项集成测试通过。
- `pnpm build`：生产构建通过，无真实认证密钥或 Cloudflare 凭据参与构建。
- `pnpm db:generate`：Schema 与 Migration 一致，无新增差异。
- `pnpm db:migrate`：首次应用 0001 和重复执行通过。
- `pnpm db:compile`：通过；编译后的迁移脚本在独立临时 SQLite 中执行通过。
- `auth check schema --config src/server/auth/cli.ts`（`pnpm auth:check` 的实际命令）：官方 Schema 检查通过，使用进程内随机临时密钥与临时数据库。
- `docker compose config --quiet`：使用临时进程环境配置通过；本阶段没有重新构建或运行 Docker 镜像。
- `pnpm admin:init` 在非 TTY 运行：按预期退出 1，拒绝管道/非交互输入，未创建账号。
- `git diff --check`：通过。原 0000 Migration 与业务 Schema 未修改。

认证与 HTTP 测试均自动建立并清理临时数据库、生成随机测试密码与密钥。开发数据库已迁移，最终检查 user 和 photos 均为 0；未填入真实管理员、测试账号或演示照片，未保存真实密钥。

## 集成安全测试

新增 12 项认证测试和 1 项旧库迁移测试，连同原 6 项共 19 项：

- 官方 createUser 流程生成 UUID 与密码哈希，Better Auth verifyPassword 验证；过短密码拒绝且无记录。
- 登录成功/失败/非法输入；刷新请求保持 Cookie 会话，响应不含哈希/Token。
- 匿名/伪造 Cookie 401；普通身份与伪造 role 403，注册及 Admin Plugin 创建/改角色接口 404。
- 数据库撤销角色/禁用后立即失去权限，不使用权限 Cookie Cache。
- Session 过期拒绝，退出后重用旧 Cookie 401。
- 外部 Origin 的登录/退出以及外部或协议相对回调地址 403。
- 登录限流持久化到 SQLite，重新创建 auth 实例仍限流；伪造 forwarded / CF IP 无法绕过。
- 同时 20 次非法登录：10 次允许进入输入检查，另 10 次返回 429。
- HTTPS 配置发送 Secure + HttpOnly + SameSite=Lax、无 Domain 的 Cookie。
- 仅应用 0000 的旧库先写业务与历史日志，再升级 0001；内容保持一致、重复迁移成功、没有自动账号。

Better Auth 在刻意触发失败测试时打印 Invalid password / Origin / callback 以及共享限流桶提示，属于预期拒绝路径。

## 实际 Next.js HTTP 流程

`pnpm test:auth-flow` 在生产构建后启动真实 standalone 服务，使用独立临时数据库与随机端口。覆盖公开页面、真实登录表单 HTML、后台页面、认证 API 和数据库会话，6 项测试通过。

`AHAU_TEST_SERVER_MODE=development pnpm test:auth-flow` 实际启动开发服务，5 项业务流程测试通过；生产启动配置用例仅在生产模式运行。

| 请求/操作                                        | 实际结果                            |
| ------------------------------------------------ | ----------------------------------- |
| 匿名 `/`、`/submit`、`/admin/login`              | 200；登录表单可用、无注册入口       |
| 匿名 `/admin`、`/admin/reviews`、`/admin/photos` | 307 至 `/admin/login`，无管理员信息 |
| 匿名 `GET /api/admin/me`                         | 401                                 |
| 错误密码                                         | 401                                 |
| 管理员正确登录                                   | 200，设置真实 HttpOnly 会话 Cookie  |
| 登录后后台三个页面、再次请求首页                 | 200，显示当前管理员                 |
| 已登录管理员访问登录页                           | 307 至 `/admin`                     |
| 管理员 `GET /api/admin/me`                       | 200，仅基本 DTO                     |
| 退出后访问后台 / API，携带旧 Cookie              | 307 / 401                           |
| 普通测试用户访问后台 / API                       | 拒绝跳转 / 403                      |
| 数据库将会话设为已过期后访问后台 / API           | 307 / 401                           |
| 缺少必要 secret 启动生产服务                     | 输出配置错误并退出 1                |

HTTP 测试证明路由、Cookie、服务端判断与数据库状态；没有运行浏览器 JavaScript，不能替代真实按钮点击与布局检查。当前登录加载、防重复、显示/隐藏密码、键盘提交、主题与移动布局经过源码检查，仍需在可访问本地服务的浏览器中人工复核。遵守此前浏览器访问拒绝，没有绕过策略。

真实管理员初始化的最终密码交互未执行；已检查官方 CLI password 类型输入、验证非 TTY 拒绝、测试其使用的官方 createUser/哈希路径。没有用固定或弱密码完成交互演示，也未要求维护者提供真实密码。

## 第五阶段：审核与发布闭环

验证日期：2026-10-11。审核服务测试使用临时 SQLite、LocalStorage、程序生成 PNG 和注入的缓存清除结果；没有调用真实 R2、Cloudflare Zone API 或浏览器。

- `pnpm db:generate`：无 Schema 差异；`pnpm db:migrate`：`0004` 增量字段迁移首次/重复应用通过；`pnpm db:compile` 通过。
- `pnpm test:images`：7 个 Vitest 文件、83 项测试通过，包含 versioned publication receipt、批准/拒绝、撤回/恢复、原图保留、标签规范化、审核日志、CDN 任务记录、发布确认失败回滚和并发条件更新。
- `pnpm test`：19 项业务/认证/迁移测试通过；旧库迁移保留历史照片与日志。
- `pnpm check`：TypeScript、ESLint（仅 Next `<img>` 性能警告）、Prettier 和全部自动化测试通过。
- `pnpm build`：Next.js 生产构建通过，新增审核列表/详情和所有管理员 Route Handler 均为 Node 动态路由。
- `pnpm test:auth-flow`：生产 standalone 认证、私有预览、公开状态门禁和真实本地审核发布流程等 9 项回归通过。
- `git diff --check`：通过；未发现数据库文件、上传图片、构建产物或环境密钥进入变更。

已验证的服务级场景包括：pending 只能批准/拒绝，approved 只能隐藏，hidden 只能恢复；批准生成新的公开版本并保持原图私有；拒绝不写公开桶；撤回移出公开查询且删除公开对象；恢复使用新的 publicationId；编辑标签与 metadata_changes 在同一事务；并发批准只有一个审核日志和一个成功状态。未验证真实 R2 权限、Cloudflare purge、Turnstile/代理链路和浏览器视觉交互，需部署环境配置后单独验收。
