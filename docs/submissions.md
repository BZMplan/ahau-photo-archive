# 匿名投稿

第四阶段实现了无需账号的批量校园影像投稿。游客在 `/submit` 选择 1–5 张 JPEG、PNG 或 WebP，逐张填写信息，勾选授权并完成 Turnstile 后，一次性提交。服务端验证成功后建立一条 `submissions` 和 1–5 条 `photos`，每张照片的状态都是 `pending`。管理员审核和公开发布由下一阶段负责。

## 限制

限制集中定义在 `src/lib/submission-limits.ts`，前后端共享数值：

- 最多 5 张照片；单张最多 10 MiB；图片总字节最多 50 MiB。
- multipart 请求 Content-Length 上限 52 MiB，为字段和 multipart 边界预留余量。
- 仅接受 JPEG、PNG、WebP。Sharp 还会验证实际编码、完整解码、像素和单边上限。
- `authorName` 1–50 字符；照片 `title` 1–100；`description` 0–1000；`location` 0–100；`message` 0–1000；邮箱最多 254 且必须是有效格式。
- `takenAt` 是可空的合法 `YYYY-MM-DD`，不能晚于当前日期；它不会被投稿时间覆盖。

请求体上限首先检查可信的 `Content-Length`，解析 `formData()` 后仍检查每个 File 和总文件字节。缺少 Content-Length 的请求不会绕过文件检查。生产部署还应在 Cloudflare Tunnel 或前置反向代理设置至少相同的 body limit，因为 Next.js 的 `formData()` 解析本身不是流式上传防火墙。

## 请求格式

`POST /api/submissions` 只接受 `multipart/form-data`，不需要登录：

| 字段                  | 类型       | 说明                                                   |
| --------------------- | ---------- | ------------------------------------------------------ |
| `files`               | File × 1–5 | 顺序稳定，和 metadata 数组一一对应                     |
| `metadata`            | JSON 数组  | 每项包含 `title`、`description`、`takenAt`、`location` |
| `authorName`          | string     | 投稿署名，必填                                         |
| `contactEmail`        | string     | 可选联系邮箱，不公开                                   |
| `message`             | string     | 投稿备注，可选                                         |
| `consentAccepted`     | `"true"`   | 必须明确勾选                                           |
| `turnstileToken`      | string     | Cloudflare Widget 返回的短期 Token                     |
| `submissionRequestId` | UUID       | 客户端一次提交的幂等 ID                                |

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

1. Zod 验证投稿者字段、授权、requestId 和按顺序的照片元数据。
2. 调用 Siteverify 验证 Turnstile 的 `success`、预期 `hostname` 和 `action=submit`。Token 过期、重复使用或验证失败都会被拒绝；网络失败返回 503。
3. 按 HMAC 来源桶检查小时投稿次数和日照片数。
4. 建立 `submission_operations` 的 `writing` 记录。
5. 逐张调用 `ImageService.saveOriginal()`，保存原始编码字节到私有存储，再调用 `generatePreview()` 保存私有 WebP 预览。不会调用 `publishImage()`，不写公开 Bucket。
6. 在短 SQLite 事务内创建 Submission 和 Photo，并把所有照片状态设为 `pending`；同时增加限流计数并标记操作 `complete`。
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
