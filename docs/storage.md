# 图片存储与处理

## 范围与本地验证

本阶段提供 R2 / LocalStorage、Sharp 验证与衍生图、ImageService、只读管理员预览和本地公开路由。不提供上传、发布、删除 HTTP 接口，不开发匿名投稿或完整审核页面。无需真实 Cloudflare 凭据即可开发。

`.env.local` 保留既有认证配置，补充：

```dotenv
STORAGE_DRIVER=local
# 可省略，默认使用 DATABASE_PATH 所在目录下的 storage/
LOCAL_STORAGE_PATH=
```

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm storage:check
pnpm test:images
pnpm dev
```

`storage:check` 在当前配置的私有存储用随机 UUID 写入程序生成的 16×12 PNG，验证字节后立即删除并重复删除。不创建数据库照片或公开图片。Vitest 使用临时数据库/目录，R2 使用 SDK mock，不接触 Cloudflare。生产构建后 `pnpm test:auth-flow` 启动临时 standalone 服务做实际 HTTP 验证；开发模式为 `AHAU_TEST_SERVER_MODE=development pnpm test:auth-flow`。

默认目录：

```text
data/storage/private/originals/{photoId}/original.{jpg|png|webp}
data/storage/private/previews/{photoId}/preview.webp
data/storage/public/photos/{photoId}/display.webp
data/storage/public/photos/{photoId}/thumbnail.webp
```

存储不在 Next.js public/ 内。适配器验证完整 Key 白名单与 UUID，拒绝路径遍历、编码绕过、配置根目录及存储内部符号链接；原子写入，读写大小受限。可信父目录的操作系统别名会规范化，真实路径不能落在静态目录。主机文件系统只能由可信应用/维护者写入；不承诺抵御具有本机文件系统写权限的恶意进程。

## Adapter 与服务接口

`ObjectStorage` 固定 private/public scope，提供 put/get/head/delete/exists；put 支持 ifAbsent。原图和初次公开对象条件写入，head 提供大小、类型与 SHA-256。exists 仅将不存在视为 false，不吞权限/网络错误；delete 缺失对象是成功。

错误为安全的 StorageError：NOT_FOUND、FORBIDDEN、UNAVAILABLE、IO_ERROR、INVALID_KEY、TOO_LARGE、CONFLICT，不传内部堆栈或凭据。R2 两个适配器共享一个 S3Client，region auto、固定 account endpoint，请求超时 30 秒、SDK 最多 3 次尝试；下载流最多 10 MiB。无需 copyObject：衍生图由 Sharp 生成后上传，绝不复制原图到公开桶。

业务只通过 ImageService 操作图片，原始 adapter put 仅限可信基础设施/隔离测试和私有探测工具，不暴露请求参数。

| 方法                | 行为                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| saveOriginal        | 内容验证后保留原始字节，返回 UUID、Key 和元数据；相同内容幂等，原图不可替换 |
| generatePreview     | 从私有原图生成私有 WebP，返回 Key 与处理结果                                |
| generateVariants    | 生成展示/缩略图 Buffer，不写公开存储                                        |
| publishImage        | 验证真实管理员 Session，兼容固定 Key 的底层发布 receipt                     |
| publishImageVersion | 生成 publicationId，写入不可预测版本 Key 并返回 receipt                     |
| confirmPublication  | 业务事务提交后确认操作记录，不更新照片状态                                  |
| unpublishImage      | 管理员授权，幂等删除公开图，保留原图/预览                                   |
| deleteImageFiles    | 管理员授权，清理该 UUID 的规范原图、预览及公开图                            |
| getPrivateImage     | 可信服务端按 photoId 读取对应私有 Key，HTTP 入口先鉴权                      |
| recoverOperation    | 管理员显式 keep/remove，保留或补偿中断操作                                  |

Key 由服务器统一生成，原图扩展名匹配编码。浏览器不能指定任意 Bucket/Key。新规则不会自动迁移历史任意命名对象，旧资源将来单独迁移。

## 图片验证与元数据

仅实际 JPEG、PNG、WebP；先验签名，再 Sharp metadata 识别和 stats 完整解码，failOn=warning。拒绝无效/损坏文件、其他格式、动画或多页图。文件上限 **10 MiB（10×1024×1024 字节）**、像素上限 **2400 万**、单边最多 **16000px**。不信任扩展名/MIME，不关闭解码上限。

配置集中于 `src/server/images/config.ts`：最多 2 个处理，8 个等待，超出 PROCESSING_BUSY；展示/缩略图顺序生成，减少瞬时内存。未来上传入口仍须在读取 multipart 前限制请求体、并发和频率，处理服务不能替代投稿防刷。

| 类型     | 最大长边 | 编码 / 质量 |
| -------- | -------- | ----------- |
| 展示图   | 2000px   | WebP / 82   |
| 缩略图   | 600px    | WebP / 78   |
| 私有预览 | 1200px   | WebP / 80   |

保持比例、不方形裁剪、不放大；autoOrient 后缩放，默认移除 EXIF/GPS/ICC/XMP/IPTC。原图完全不重压缩、不旋转、不修改。

基础元数据为原始编码 width/height、format、mimeType、size 和可空 orientation。摄影参数只有预留类型，未解析/公开 GPS、拍摄时间或相机信息，不覆盖用户日期。输出包含 buffer/width/height/format/size。

## 只读 API 与 URL

- `GET /api/admin/photos/[id]/preview`：先 requireAdmin，再查 photoId/preview_key，Key 必须匹配该 UUID 私有预览；匿名 401、非管理员 403、缺失 404。image/webp、private no-store、Vary Cookie、nosniff；不接受任意 Key，不回退为原图或公开地址。
- `GET /api/images/[...key]`：仅 local；public 白名单、photoId 匹配，数据库必须 approved 且两衍生图及 published_at 完整。待审核/隐藏/私有路径/穿越路径 404；R2 模式不代理图片。
- `getPublicImageUrl(key)`：local 为上述路由，R2 为配置 HTTPS 自定义域名 + 分段编码的规范 Key。核心数据库只保存 Key，不存签名 URL。

管理员审核页面通过 `/api/admin/photos/[id]/preview` 查看私有预览；公开页面使用已批准版本的 display/thumbnail URL。未来 Next.js Image 只允许配置的 HTTPS hostname 与 /photos/**，禁止通配任意远程域名。

## 发布一致性与恢复

SQLite 与 R2/文件系统没有跨系统原子事务。ImageService 只操作文件和独立日志，ModerationService 负责业务状态及审核事务。

1. 可信业务获得管理员发布决定后调用 publishImageVersion，函数验证真实 Session；不能用伪造 role 对象授权。处理完再次鉴权，原图不公开。
2. 每次发布生成服务端 publicationId，两个公开 Key 使用 `photos/{photoId}/{publicationId}/...`，不会覆盖历史版本。
3. **上传前**向 SQLite image_operations 保存 writing、operationId、photoId、action、所有本次可能写入的 scope/Key。日志失败不上传。
4. 两个上传均成功后 awaiting_commit，返回 receipt。业务层此时才能事务更新 approved、published_at、Key 和审核日志；失败不得标成功。
5. 业务事务成功后 confirmVersionPublication；失败则按 operationId 补偿本次新对象，不删除已有公开内容或原图。
6. 上传失败（包括远端已写但响应丢失）清理所有可能创建的 Key；清理失败记录 cleanup_failed，并输出只有操作/照片 ID 与错误码的安全日志。修复后可重新实例化服务显式 remove 重试。
7. 进程中断留下 writing/awaiting_commit。维护者/未来恢复服务先核对照片状态，再选择 keep/remove；**不能盲目删除，数据库可能已提交**。keep 要求两公开图存在，恢复不会自动更新照片。

同一 UUID 文件操作在单进程内串行；ModerationService 另外在 SQLite 使用 `WHERE status = expected` 条件更新，跨进程竞争只有一个状态转换成功。重复调用可能增加少量失败补偿记录，但不会覆盖已发布版本；恢复决定和业务事务之间避免并发发布。

R2 公开域名直接访问对象，授权上传与数据库提交间有短暂窗口；上传前管理员授权已校验，失败清理提供补偿，不能声称未提交对象从未短暂可见。本地路由额外按数据库状态阻止访问。

## 撤回、删除与 CDN

unpublish 只删公开衍生图；delete 还删私有对象。均不改 photos/审核历史。未来业务层先撤销公开查询，再删除对象并处理缓存；永久删除需档案保留/用户授权政策。

公开响应采用 60 秒缓存并重新验证，不设置 immutable。**删除 R2 对象不保证缓存节点/浏览器立即停止提供旧图。** 审核服务撤回后调用 `storage/cache-invalidation.ts`；配置最小权限的 `CLOUDFLARE_ZONE_ID` 与 `CLOUDFLARE_CACHE_PURGE_TOKEN` 时按受影响 URL 执行 Purge by URL，未配置返回 `not_configured`，网络/API 失败返回 `failed`，不会报告成功。紧急撤回仍需核对所有公开入口，必要时控制台人工清理；已下载副本无法收回。Cloudflare 自定义缓存规则可能覆盖 TTL，需上线前核对。

## Cloudflare 控制台配置

由维护者手动执行；代码不创建 Bucket、不改访问策略、DNS 或 Token。

1. R2 Object Storage 按控制台引导启用，创建 campus-archive-private 和 campus-archive-public 两个普通 jurisdiction Bucket。本实现用默认 account endpoint；EU/FedRAMP 等区域端点需后续单独支持，不能混用。
2. 私有桶 Settings：**Public Development URL 必须 Disabled，不能配置公开 Custom Domain**。R2 默认私有，保持设置，上线前验证匿名访问失败；所有原图/待审核文件只在此桶。
3. 公开桶 Settings → Custom Domains → Add，关联同账号 Cloudflare zone 中的图片域名（如 images.example.com），核对 DNS，等待 Active。仅存授权衍生图，生产保持 r2.dev Disabled，避免第二入口绕过策略。不为私有桶配置公开域名或不必要的 CORS。
4. R2 → Manage R2 API Tokens，创建账户或用户 Token，选择 **Object Read & Write**，限定这两个 Bucket。不要选 Admin Read & Write/全账户资源。一次展示的 Access Key ID/Secret Access Key 保存于安全的服务端部署秘密，不进入 Git 或客户端；它只用于 S3 对象操作。
5. 服务端 `.env.local` 或 Docker 运行时配置：

```dotenv
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=<32 位十六进制 Account ID>
R2_ACCESS_KEY_ID=<S3 Access Key ID>
R2_SECRET_ACCESS_KEY=<S3 Secret Access Key>
R2_PRIVATE_BUCKET=campus-archive-private
R2_PUBLIC_BUCKET=campus-archive-public
R2_PUBLIC_BASE_URL=https://images.example.com
```

6. URL 为 HTTPS origin，无路径、凭据、query/hash，桶名不同。local 忽略空 R2 配置；生产 driver 未设默认要求 r2，缺项明确退出，绝不静默回退；显式 local 可用于本地生产测试或自托管持久化。
7. 维护者主动执行 `pnpm storage:check --allow-r2` 检查两个 HeadBucket。不会创建公开对象，不验证公开写权限、私有匿名策略或 CDN，这些需控制台与后续授权实测。未带参数拒绝 R2 探测。**本次开发未执行真实云检查。**

Compose 只在运行时传入 driver、密钥、桶名和域名；local 在持久卷 `/app/data/storage`。生产使用 `.env.production.example` 复制出的本地 `.env.production`，按 [部署指南](deployment.md) 显式迁移后启动；构建不需凭据。不要删除卷或把存储移入 static/public。

修改驱动/桶/目录配置后重启应用；存储实例在进程内复用。切换驱动不会自动复制旧对象，需要独立迁移与校验 Key/字节后切换，不能盲切。未来重生成已公开图片时，先业务隐藏、撤回并处理 CDN 缓存，再生成/发布；hash 冲突不会原位覆盖旧公开资源。

## 故障、备份和成本

根据安全错误码区分不可用、权限、不存在与冲突，不把所有失败吞成缺失。SDK 有限重试；保留 operationId，修复配置/网络后恢复，避免无界重试。检查 image_operations 的非 complete 记录，按日志核对 Key。

数据库和私有原图是档案核心，衍生图可重新生成。SQLite 在线备份或停服务完整复制目录，备份操作日志；定期另存两桶清单及原图到独立位置，按需备份预览/公开图。隔离恢复演练核对 Key、字节散列与业务记录，保护联系方式/EXIF；不能只复制活跃 SQLite 主文件而丢 WAL。

容量和请求次数决定成本：一份原图加三较小衍生图，固定 Key 避免重复；监控容量、A/B 类请求、备份和缓存命中，设置预算提醒。避免无谓重生成、无界重试；按访问频率评估 Standard 类，生命周期不能自动删档案原图。免费额度与费用会变化，查官方当前计费，不固定估价。

## 官方参考

实现前 Context7 核对 Sharp、R2、Vitest，其余细节参考官方与已安装类型/源码：

- [R2 S3 JavaScript](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [公开 Bucket、自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [最小权限 Token](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 定价](https://developers.cloudflare.com/r2/pricing/)
- [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/) / [输出和元数据](https://sharp.pixelplumbing.com/api-output/)
