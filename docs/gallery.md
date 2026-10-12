# 公开影像与档案

第六阶段复用现有 Next.js 单体、SQLite、审核发布与 LocalStorage/R2。公开照片来源只有数据库中已批准的馆藏；不会生成示例照片、从第三方图库补图或在页面渲染时读取原图。

## 页面与视觉

AHAU 是 Anhui Agricultural University（安徽农业大学）的完整英文缩写，所有品牌文字保持整体，不拆成 AH AU。

- `/`：完整视口的纯文字开场，英文衬线标题 AHAU / Photo Archive、中文学校名称、简短介绍、档案与投稿入口，底部学校英文名。公共外层 min-height: 100svh，Hero 扣除紧凑导航高度；没有照片展示、照片背景或照片列表查询，导航关闭自动预取。暖白/深色主题及轻微入场动画，支持 prefers-reduced-motion。
- `/archive`：全宽瀑布流、匹配数、分页、空状态和固定底部 Dock；没有顶部筛选表单或 max-width 照片墙容器。
- `/tags/[slug]`：实际标签名称、公开计数、同款瀑布流与分页；不存在标签 404。没有公开照片时显示空状态，不泄露私有计数。
- `/photo/[id]`：直角大图、标题、描述、拍摄日期/地点、署名、发布日期、可点击标签及最多 4 张相关照片；保留 Lightbox。当前数据模型没有摄影 EXIF 字段，继续不显示相机/GPS，也不解析私有原图。档案照片链接携带 `from`，只允许校验并重建本地 `/archive` 的合法筛选与页码作为返回入口。

照片墙采用 CSS Columns，360px 以下 1 列，360–767px 2 列，768–1099px 3 列，1100–1599px 4 列，1600–2199px 5 列，2200px 起 6 列。桌面左右 20px、手机 12px、作品间 10px。照片 inline-block / break-inside: avoid 保证不跨列，顺序按列从上到下、再向右；DOM、屏幕阅读器与 Tab 顺序均沿 SQL 的稳定顺序，不采用 CSS order 或客户端重排。每页仍只查询有限照片，切换分页或筛选由浏览器重新平衡列。极长照片保持全图，在列内自然增长，不跨列或裁切；现代记录的宽高提前预留空间。

所有公开照片容器和 img 使用 rounded-none / border-radius: 0，不加背景卡片、阴影或固定信息区；加载占位背景仅用于图片本身。桌面 hover、键盘 focus-visible 在照片底部显示轻微渐变标题/地点/年份，无缩放；触屏点击即可进入详情，关键内容在详情和链接可访问名称中提供。

`PhotoLightbox` 使用原生 modal dialog，浏览器管理焦点限制与 Escape；关闭按钮和遮罩可关闭，关闭后焦点返回主图按钮。svh/vw 限制可视大小，object-contain 保留完整照片，只加载 display。

## 底部 Dock

桌面 Dock 集中提供年份、季节、地点、标签、排序、重置，选中按钮显示当前值（长文本截断但可访问名称保留全文），排序显示当前非默认方式。一次只打开一个 Radix Popover，从 Dock 上方向上展开，限制视口与高度，支持外部点击、Escape、焦点返回与原生 radio 键盘操作。地点/标签可搜索；选项来自 `getArchiveFilters` 的真实公开数据库，季节复用现有 seasonLabels。

手机 Dock 仅筛选、排序、重置：筛选打开 Radix modal Dialog 底部抽屉，集中显示四种筛选与排序；排序入口打开排序面板。选项立即更新 URL 和照片，不需要应用按钮；抽屉保留以便组合筛选，关闭后返回实际触发按钮。modal 限制焦点并覆盖 Dock；切换桌面/手机断点关闭弹层。两种界面使用同一 query，不维护两套筛选状态。空馆藏也保留 Dock；无匹配时提供清除筛选。

Dock bottom: 20px + env(safe-area-inset-bottom)，照片墙底部保留 144px + safe-area，使最后一张照片和分页能够滚动至 Dock 上方。弹层使用 Portal，显式适配浅色/深色。导航 pending 期间禁用重复筛选并播报状态，防止快速连续操作覆盖尚未提交的 URL 条件。

## 统一查询与隐私

`src/server/services/public-photos.ts` 是公开服务入口（PublicPhotoService 的函数式实现）。`getPublishedPhotos`、`getPublishedPhotoById`、`getPublishedTags`、`getPublishedTagBySlug`、`getArchiveFilters`、`getRelatedPhotos` 与 sitemap ID 查询共用公开条件：

- `photos.status = approved`；
- display_key、thumbnail_key、published_at 均非空。

详情查不到时调用 notFound，包括 pending/rejected/hidden。SQL 显式投影，返回 DTO 再次白名单映射。DTO 仅有 id、title、description、location、takenAt、publishedAt、attribution、displayUrl、thumbnailUrl、width、height、tags 与对应 tagSlugs。数据库 Key 只供服务端 URL 模块转换，不把 originalKey、previewKey、联系方式、审核日志或管理员信息传给浏览器。标签按本页 ID 批量关联，避免每张照片一次查询。

## 日期、地点与 URL

日期沿用已有的 `YYYY-MM-DD` 日历日期，不通过时区转换生成拍摄年份。年份用 SQL 日期范围过滤，年份选项只来自有拍摄日期的公开记录；null 不属于任何年份/季节。月份通过 SQL substr 推导：3–5 春、6–8 夏、9–11 秋、12/1/2 冬。冬季仍按照片自身日历年份归档（2025 冬包含 2025 年 1、2、12 月）。

地点使用统一 `normalizeLocation`：trim、所有连续空白合并成空格、toLowerCase。连接注册确定性 SQLite 函数 normalize_location，历史记录在 SQL 筛选和分组时使用相同规则，不修改用户原始地点文本；不需要迁移数据或增加 GIS。空地点不进入筛选项。

标签参数采用数据库已有 slug，支持中文 URL 编码；SQL EXISTS 关联 photo_tags 和 tags，仍附加 approved 条件。筛选项的标签计数只包含公开照片。

参数由 `lib/validations/archive.ts` 逐字段校验：空值视作未选，非法值恢复该字段默认，重复参数忽略，保留其他有效字段。合法但不存在的年份、地点或标签得到零结果。Dock 通过 router.push 更新 URL Search Params，服务器页面重新读取校验后的 query，自动刷新照片墙；可复制、刷新、前进和后退。更改筛选或排序不携带 page，从第一页开始；分页保留条件和 pageSize，标签页分页保持在标签路由。

## 排序、分页与索引

档案默认 24，最多 60；首页没有照片读取；正整数页码，SQL LIMIT/OFFSET，不读全量照片后筛选。页码超出结果范围显示空结果和返回上一页入口，不自动换成别的筛选。四种排序分别使用 publishedAt DESC/ASC、takenAt DESC/ASC；拍摄日期为 null 的记录在两种拍摄排序中均排最后。每种排序再按唯一 id 同方向排序，时间相同也稳定。并发发布会改变 OFFSET 页边界；不承诺跨多个请求的数据库快照。

已有 photos_status_published_idx、photos_status_taken_idx、photos_status_location_idx、photo_tags 复合主键和 photo_tags_tag_idx，无需重复 Migration。年份范围可利用 status/takenAt 索引；规范化地点需在 approved 候选中执行函数，当前规模无需新增函数索引。sitemap 仅分批读取公开 ID，每批 1000 条；规模达到 50000 URL 前应拆分 sitemap。

## 图片加载与存储

URL 全部经 `storage/urls.ts`：local 走既有 `/api/images/photos/...`（再次核对当前 approved 和当前 Key），R2 走经过服务端校验的 R2_PUBLIC_BASE_URL HTTPS origin 与规范公开 Key。缺失配置抛出明确服务端错误，页面使用通用错误重试状态，不把失败伪装成空馆藏。

PhotoImage 使用 next/image，容器按数据库宽高预留比例，width/height、object-contain 和 sizes 适应屏幕；详情首图和照片墙第一张 eager/high，其余 lazy，关闭照片详情自动预取以减少额外数据请求。背景占位、加载后淡入、失败时文字提示，不回退私有资源。没有保存宽高的历史记录先以 4:3 预留区域；加载后读取浏览器已加载公开衍生图的自然尺寸修正比例，兼容早期保存原始 EXIF 方向尺寸的记录，不读取原图。此类历史记录首次加载可能有一次比例修正。

ImageService 已生成 600px thumbnail 与 2000px display WebP，本阶段全局 `unoptimized`，不启用 Next 二次编码及独立优化缓存，不配置任意外部优化域名。remotePatterns 为空，localPatterns 限定公开照片路径。unoptimized 不依赖 remotePatterns 校验，真正的源限制由服务端 URL 生成/Key 校验和固定 R2 origin 保证。R2 域名可在运行时配置，不要求构建时注入秘密。该方案避免单实例 CPU/磁盘缓存开销，也减少撤回时需要处理的缓存层；不会动态生成更多宽度的 WebP。

## 缓存与发布撤回

首页为静态开场，构建和访问均不查询照片。档案、标签、详情、robots 和 sitemap 为 force-dynamic，运行时 SQLite 查询；不启用 use cache、unstable_cache 或跨请求查询缓存。详情与 metadata 只用 React cache 在一次请求内去重。

审核服务继续 revalidatePath，并覆盖 archive、photo 动态路径、tag 动态路径和 sitemap；批准和修改后的新请求读最新数据，隐藏后详情 404、列表消失，恢复有新的 publicationId/URL。已打开的浏览器页面不会被服务器推送删除；刷新或新请求后同步状态。Next 页面缓存、客户端已呈现 DOM、图片浏览器缓存和 Cloudflare CDN 是独立层，revalidatePath 不能清除 Cloudflare。原有 purge 和 cache_purge_tasks 流程保留，未配置/失败必须显式报告。

## SEO

首页继承根 Metadata 的站名/描述；档案和标签有对应标题。照片 generateMetadata 与页面共用批准照片查询，描述缺失时用校园档案介绍，OG 只使用 displayUrl。metadataBase 使用既有固定 BETTER_AUTH_URL（本地 localhost），不信任请求 Host。隐藏照片不生成照片 OG。动态 sitemap 仅包含首页、档案和公开照片详情；robots 禁止 admin/api，sitemap 地址按运行时固定 origin 生成。

## 可重复本地验收

自动化运行 `pnpm check && pnpm build && pnpm test:auth-flow`，使用独立临时数据库和存储，mock R2/验证器，不写开发数据。HTTP 流程启动真实 standalone，验证首页始终没有照片，以及批准→档案/标签/详情/OG/sitemap→撤回消失/404→恢复新 URL。Vitest 覆盖状态隔离、DTO 白名单、日期/季节/地点/标签组合、分页排序、参数边界和 URL。

人工验收建议使用新建的临时 DATABASE_PATH 与 LOCAL_STORAGE_PATH（不要指向开发/生产目录），认证 origin 为当前本地地址，STORAGE_DRIVER=local。保留已有 .env.local，不覆盖秘密。按 README 配置本地 Turnstile 官方测试密钥。

1. 对隔离库执行 pnpm db:migrate，在可信 TTY 执行 pnpm admin:init，再 pnpm dev。
2. `/submit` 投稿横向、纵向照片，设置不同年份、季节和地点，保留一张无日期；管理员编辑标签，批准部分、拒绝部分、保留部分 pending。
3. 首页无图片或照片请求；档案依次测试年份、四季、空日期、地点/标签和组合；复制链接、新开窗口、后退，检查筛选不丢失。筛选变更回到第一页。
4. 详情查看署名、日期、描述和标签；标签链接与分页正常。点击主图，Tab 焦点留在 dialog，Escape/关闭按钮关闭，焦点回到触发按钮。
5. 测试手机宽度、桌面、浅色/深色和长标题；图片加载失败显示提示，没有请求 originals/previews。
6. 管理员撤回，重新请求档案、标签、sitemap 不再含该照片（首页始终无照片），详情及旧 local 图片 URL 为 404。恢复后重新出现，公开 URL 与旧版本不同，原图仍私有。

真实 R2 权限、CDN purge、手机触摸和浏览器交互需上线前额外验收。第七阶段已实现单实例 Docker Compose 部署、SQLite 持久化与外部反向代理接入说明；长期备份策略、失败 operation/purge 任务监控与性能优化列为可选第八阶段，不增加搜索或社交基础设施。

## 文档依据

开发核对了安装版 Next.js 16.4 的导航、useRouter、image 文档与 Context7 `/vercel/next.js`、Radix `/websites/radix-ui_primitives` 的 Popover/Dialog 文档。Image 使用 unoptimized 的行为见 [Next Image](https://nextjs.org/docs/app/api-reference/components/image)，请求内 metadata 去重见 [Metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)。

## 本次验证记录

- pnpm check：类型/格式通过；22 项基础与认证测试、128 项 Vitest 通过。ESLint 0 错误，后台原有 5 条 img 警告。
- pnpm build：Next.js 16.4 生产构建通过，首页为静态开场，照片相关公开页、robots/sitemap 为动态路由。
- 本次没有修改 Schema、迁移、公开查询、认证、审核或存储服务。现有测试继续覆盖首次/重复迁移和历史库升级。
- pnpm test:auth-flow：9 项真实 standalone HTTP 测试通过，新增公开页面、OG、sitemap 和撤回/恢复断言。
- 浏览器工具访问本地隔离测试地址时被权限策略拒绝；未完成 1440px、1920px、768px、390px 的浏览器视觉、移动端触摸、Dock 交互/前进后退和 dialog 焦点实测；不以渲染单元测试代替视觉验收。项目没有 Playwright；未新增浏览器依赖或修改真实数据库，临时浏览器验收服务已关闭并清理。没有调用真实 R2/CDN。
