# 第一阶段验证记录

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
