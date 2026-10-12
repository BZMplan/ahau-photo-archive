# 匿名投稿

第四阶段实现了无需账号的批量校园影像投稿。游客在 `/submit` 选择 1–5 张 JPEG、PNG 或 WebP，逐张填写信息，勾选授权并完成 Turnstile 后，一次性提交。服务端验证成功后建立一条 `submissions` 和 1–5 条 `photos`，每张照片的状态都是 `pending`。管理员审核和公开发布由既有审核服务负责。

## 全屏投稿编辑器

AHAU 是 Anhui Agricultural University（安徽农业大学）的完整缩写，所有界面文字保持整体。
`/submit` 复用公共紧凑导航，隐藏该页面的页脚和顶部大介绍。主体填满剩余动态视口：桌面 65% 图片区 / 35% 信息区，平板约 60% / 40%，768px 以下改为上方预览、下方表单。预览区背景、文字、工具栏、分隔线和滚动条复用网站主题变量，随浅色/深色主题同步切换。左右没有卡片阴影，只以细线区隔；照片始终直角、object-contain 完整展示。输入框/按钮仍可使用轻微圆角。

图片区原生 overflow-y: auto、scroll-snap-type: y mandatory，每个稳定 UUID 的 slide 占该滚动容器完整高度，并使用 scroll-snap-align: start 与 scroll-snap-stop: always。鼠标/触控板/触摸交给浏览器，不截获 wheel。IntersectionObserver 的 root 是左侧容器，60% 可见比例避免相邻照片在中点反复切换；scrollend 以容器中心确认最终选中。上一张/下一张通过统一 scrollToPhoto 实际滚动，由相同 observer 更新当前 ID；减少动画偏好使用即时滚动。ResizeObserver 在容器高度变化时重新对齐当前照片。

右侧渲染当前照片的标题、说明、拍摄日期、地点和标签，按 UUID 在 metadata record 中独立保存；照片切换只重置搜索文字，不清空已选目录 ID。照片列表、元数据与公共批次信息由同一 SubmissionForm 管理；署名、邮箱、备注、授权和 Turnstile 不随切换重置。地点和标签来自管理员目录，地点单选、标签多选；名称展示缓存与 ID 草稿分开，提交仅包含 locationId/tagIds。空搜索不显示完整列表，输入后 180ms 防抖查询，已选标签排除并显示可移除 Chip。详见 [目录指南](catalog.md)。

右侧独立 overflow-y: auto，双方 overscroll-behavior-y: contain 避免滚动传递。切换照片时信息区回到顶部，元数据仍保留。底部提交栏位于右侧滚动区域之外，保持可访问；手机使用相同数据状态和上下分区，VisualViewport 在正常缩放的手机键盘展开时调整页面高度，预览区缩小，让字段和操作栏可用。没有全局切图键盘快捷键。

ImageUploader 继续负责 MIME/数量/大小校验、点击选择、多文件和拖拽追加，数值复用 submission-limits。第一次添加选择首张，追加保留当前照片。删除需原生 modal dialog 确认；删除当前照片选择下一张或前一张，删除其他项保留当前 ID，删除元数据并立即 revokeObjectURL。最后一张删除后回到空状态和上传焦点。Object URL 每个文件只生成一次，切换不重复创建；卸载或成功受理释放全部。预览仅在本地，当前及邻近照片优先显示、其他懒加载，全部 slide 保留以维持 Snap 高度；加载后轻微淡入，失败有提示，支持 prefers-reduced-motion。

提交采用 noValidate 配合既有 photoMetadataListSchema 与 photoSubmissionSchema 检查全部照片（包括未显示的草稿）和公共信息；错误指出第几张/具体字段，自动定位照片与输入焦点，辅助技术通过 aria-invalid、aria-describedby 和 role=alert 获知。文件与元数据依旧依次写 multipart，公共信息只写一次。提交中禁止文件修改与重复请求；失败保留照片/草稿并重新要求安全验证，重试沿用本批次 requestId。Token 从已验证变为空时重置当前 Turnstile Widget，重试必须取得新 Token；Widget 使用 compact 尺寸适配窄面板，卸载使用 remove 清理，onReady 支持再次进入投稿页。成功仅展示受理编号、数量与待审核提示，不提供私有 URL。

## 限制

限制集中定义在 `src/lib/submission-limits.ts`，前后端共享数值：

- 最多 5 张照片；单张最多 10 MiB；图片总字节最多 50 MiB。
- multipart 请求 Content-Length 上限 52 MiB，为字段和 multipart 边界预留余量。
- 仅接受 JPEG、PNG、WebP。Sharp 还会验证实际编码、完整解码、像素和单边上限。
- `authorName` 1–50 字符；照片 `title` 1–100；`description` 0–1000；地点为可空 UUID `locationId`；标签为最多 20 个不重复 UUID 的 `tagIds`；`message` 0–1000；邮箱最多 254 且必须是有效格式。
- `takenAt` 是可空的合法 `YYYY-MM-DD`，不能晚于当前日期；它不会被投稿时间覆盖。

请求体上限首先检查可信的 `Content-Length`，解析 `formData()` 后仍检查每个 File 和总文件字节。缺少 Content-Length 的请求不会绕过文件检查。生产部署还应在外部反向代理设置与 52 MiB 投稿请求上限兼容的 body limit，因为 Next.js 的 `formData()` 解析本身不是流式上传防火墙。

## 请求格式

`POST /api/submissions` 只接受 `multipart/form-data`，不需要登录：

| 字段                  | 类型       | 说明                                                               |
| --------------------- | ---------- | ------------------------------------------------------------------ |
| `files`               | File × 1–5 | 顺序稳定，和 metadata 数组一一对应                                 |
| `metadata`            | JSON 数组  | 每项包含 `title`、`description`、`takenAt`、`locationId`、`tagIds` |
| `authorName`          | string     | 投稿署名，必填                                                     |
| `contactEmail`        | string     | 可选联系邮箱，不公开                                               |
| `message`             | string     | 投稿备注，可选                                                     |
| `consentAccepted`     | `"true"`   | 必须明确勾选                                                       |
| `turnstileToken`      | string     | Cloudflare Widget 返回的短期 Token                                 |
| `submissionRequestId` | UUID       | 客户端一次提交的幂等 ID                                            |

文件的关联只依赖 `files` 的顺序和 `metadata[index]`，不依赖用户文件名。服务端 Zod 会重新验证所有文本和数组长度；客户端 HTML 的 `required`、`maxLength` 只是输入体验。

成功响应为 `201`：

```json
{
  "success": true,
  "data": {
    "submissionId": "uuid",
    "photoCount": 2,
    "status": "pending"
  }
}
```

响应不包含私有 Object Key、私有 URL、原图、预览 URL、联系邮箱、审核信息或凭据。`submissionId` 只是受理编号，不能用于读取照片。

错误使用项目统一结构 `{ "error": { "code", "message" } }`：格式错误 400，请求体过大 413，格式不支持 415，图片/字段验证失败 422，限流 429（带 `Retry-After`），存储或 Turnstile 服务不可用 503。错误响应为 `no-store`，不会返回内部堆栈。

## 服务端流程与补偿

Route Handler 只负责 Origin、Content-Type、请求大小、FormData 读取和错误映射；`SubmissionService` 负责业务流程：

1. Zod 验证投稿者字段、授权、requestId 和按顺序的照片元数据，拒绝自由文本地点/标签、伪造或重复 ID。验证安全凭据后检查地点/标签存在且启用；失效选择返回 422 并指出第几张照片。
2. 调用 Siteverify 验证 Turnstile 的 `success`、预期 `hostname` 和 `action=submit`。Token 过期、重复使用或验证失败都会被拒绝；网络失败返回 503。
3. 按 HMAC 来源桶检查小时投稿次数和日照片数。
4. 建立 `submission_operations` 的 `writing` 记录。
5. 逐张调用 `ImageService.saveOriginal()`，保存原始编码字节到私有存储，再调用 `generatePreview()` 保存私有 WebP 预览。不会调用 `publishImage()`，不写公开 Bucket。
6. 在短 SQLite 同步事务内再次验证目录状态，创建 Submission、Photo 和 PhotoTags，并把所有照片状态设为 `pending`；同时增加限流计数并标记操作 `complete`。上传期间禁用的选项会使事务回滚并触发对象补偿。
7. 只有数据库事务成功才返回 `201`。

对象存储和 SQLite 没有跨系统原子事务。如果中途失败，服务会删除已保存的私有原图和预览；清理失败时操作标记 `cleanup_failed` 并只记录 operationId 的安全日志。清理成功的失败操作标记为 `failed`，相同 `submissionRequestId` 可以重试。已完成的 requestId 返回原受理结果，不重复创建批次。`submission_operations` 保留对象列表，方便后续孤立文件排查。

## Turnstile

前端使用 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 渲染 Cloudflare Widget，主题交给 Widget 自动适配。服务端只读取 `TURNSTILE_SECRET_KEY`，向 `https://challenges.cloudflare.com/turnstile/v0/siteverify` 发起 POST，不接受前端传来的 success 标志。预期 hostname 来自固定的 `BETTER_AUTH_URL`，action 固定为 `submit`。

本地可使用 Cloudflare 官方测试 Site Key/Secret Key；生产必须创建绑定实际域名的 Widget，不能把测试 Secret 放入生产。缺少 Secret 时投稿请求失败，不会静默跳过验证。真实 Cloudflare 验证尚未在本次开发中执行。

## 匿名限流与来源

默认使用保守的全局桶，避免信任任意代理头。`RATE_LIMIT_SECRET` 用于 HMAC；本地为空时回退到 `BETTER_AUTH_SECRET`。每小时最多 3 次成功投稿，每天最多 15 张照片。计数在最终 SQLite 事务中递增，失败批次不会留下成功记录；过期桶会在新请求中清理。

只有当外部入口已认证、剥离用户自带同名头并明确配置 `TRUSTED_PROXY_IP_HEADER` 时，才按该头进行 HMAC 分桶。不要直接信任 `X-Forwarded-For`、`CF-Connecting-IP` 或任意浏览器 Header。NAT 用户可能共享保守桶，这是有意的安全取舍。

投稿接口要求同源 `Origin`；没有 Origin 的脚本/CLI 请求仍必须通过完整服务端验证。没有 CORS 通配，也没有公开查询、重试查询或删除接口。

## 本地验证

复制 `.env.example` 后至少设置：

```dotenv
BETTER_AUTH_SECRET=<随机至少 32 字符>
BETTER_AUTH_URL=http://localhost:3000
STORAGE_DRIVER=local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Cloudflare 官方测试 Site Key>
TURNSTILE_SECRET_KEY=<Cloudflare 官方测试 Secret Key>
```

执行：

```bash
pnpm db:migrate
pnpm test:images
pnpm dev
```

Vitest 的投稿集成测试使用临时 SQLite、LocalStorage、程序生成的图片和注入的 Siteverify 响应；不会访问真实 R2，也不会污染开发数据库。手动打开 `/submit`，选择测试图片，填写每张标题，勾选授权，完成 Widget 后提交。成功页面只显示受理编号、图片数量和“待审核”。数据库中应看到 pending 记录，`photos.display_key` / `thumbnail_key` / `published_at` 为空，文件只在 `storage/private`。

## 后续审核接入

审核服务必须先通过管理员权限检查，再读取 `preview_key`；批准流程调用现有 ImageService 生成公开衍生图，成功后在同一业务事务中更新 `approved`、公开 Key、`published_at` 和审核日志，然后确认发布 receipt。投稿服务不应被扩展为审核服务，也不能因为文件写入成功自动批准或公开照片。

## 前台重构验证

新增仅开发测试依赖 jsdom，使用 Vitest 与 React act 运行真实组件状态/DOM 事件；IntersectionObserver、ResizeObserver、滚动几何、Object URL 和 Widget 在 DOM 测试中模拟。覆盖选择/拖拽/追加、相邻照片阈值、独立元数据与公共信息、上一张/下一张实际滚动调用、右侧滚动隔离、确认删除/空状态/URL 清理、格式/数量/大小限制、定位第三张错误、日期/授权/邮箱/验证提示、单/多图 multipart 顺序、pending 成功、失败保留和重复请求保护、重试 requestId、重排与尺寸恢复。

DOM 模拟不等同于真实浏览器滚轮、触摸、Scroll Snap 或视觉验收。服务端单/多图、私有 pending、字段错位、限流、Turnstile 和失败补偿继续由现有隔离 SQLite/存储测试覆盖。本次未改 SubmissionService、投稿 API、数据库 Schema 或服务端安全校验。

本次验收：

- `pnpm check`：TypeScript、ESLint、Prettier、22 项 Node 测试与 151 项 Vitest；新增 19 项编辑器交互/状态测试和 4 项 Widget 生命周期测试。后台原有 5 条 img 警告保留，未关闭规则。
- `pnpm build`、构建后的 `pnpm test:auth-flow`：生产构建和 9 项隔离 standalone HTTP 测试；没有新增 Migration。
- 浏览器访问同一本地隔离地址被已保存的站点权限设置拒绝，未完成 1920×1080、1440×900、768×1024、390×844 的真实布局、滚轮/触摸、缩放、键盘与左右滚动检查。临时服务和生成的测试图片/数据库在结束后清理。
- 没有配置 Playwright，未增加浏览器运行依赖。未执行真实 Turnstile/Siteverify、R2 或 CDN 验证；Widget/API 在自动化测试中使用 mock，绝不视为真实云验证通过。

客户端生命周期依据 Context7 与官方 [Turnstile Widget 生命周期](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/) 和 [Next Script onReady](https://nextjs.org/docs/app/api-reference/components/script#onready)，服务端仍使用既有精确 hostname/action 校验。

## 目录接入验收

本次已扩展投稿契约和服务端事务；前文“前台重构验证”记录描述上一阶段。当前目录规则与完整验收步骤以 [catalog.md](catalog.md) 为准。迁移和测试均使用独立临时数据库，不写入真实照片。地点仍为选填，输入但未选择候选时提交 null；标签提交每张照片自己的 ID 数组。
