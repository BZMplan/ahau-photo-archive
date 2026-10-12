# 地点与标签目录

AHAU 是 Anhui Agricultural University（安徽农业大学）的完整英文缩写，保持不可拆分。

## 数据与维护

管理员通过 `/admin/locations`、`/admin/tags` 查看、搜索、新增、编辑、禁用/恢复地点和标签。Dialog 提供名称、说明、启用状态、slug、非负排序权重；列表每页 20 条，显示状态与全部关联照片数量，成功后立即刷新。没有物理删除接口。名称 trim、合并连续空白，规范化键统一英文小写；数据库约束同时保护名称、规范化名称与 slug 唯一。空名称拒绝，名称或 slug 冲突返回 409。

locations 使用 UUID 主键，包含 name、normalized_name、slug、description、is_active、sort_order、created_at、updated_at。photos.location_id 可空且外键 RESTRICT，每张照片最多一个地点。tags 复用原表并增加同类管理字段；photo_tags 保持原多对多表。slug 可含中文/字母/数字/下划线/连字符；未填写时生成 entry-UUID，不猜测中文拼音。已被照片使用的 slug 保持稳定，避免破坏既有标签 URL。

## API 与安全

| 方法       | 路径                                                | 用途                      |
| ---------- | --------------------------------------------------- | ------------------------- |
| GET / POST | `/api/admin/locations`、`/api/admin/tags`           | 分页查询 / 新增           |
| PATCH      | `/api/admin/locations/[id]`、`/api/admin/tags/[id]` | 编辑白名单字段、禁用/恢复 |
| GET        | `/api/locations`、`/api/tags`                       | 游客搜索启用选项          |

管理 API 先验证 Better Auth 有效 Session、精确 admin 角色、禁用/模拟会话与首次改密门禁；写操作精确核对可信 Origin。Zod strict 白名单拒绝 role、任意数据库字段及非法输入。未登录 401、非管理员 403、不存在 404、名称/slug 冲突 409、输入错误 422。响应使用 `{ data }` 或 `{ error: { code, message } }`、no-store，内部数据库异常不返回浏览器。

公开搜索仅返回 id/name/slug，不含使用数量、管理员、联系方式或审核数据。q 最多 100 字符、limit 默认 12 且最多 20；trim 后中文包含匹配、英文忽略大小写，SQL 参数化 instr 匹配使 `%`、`_` 不成为通配符。按 sortOrder/name/id 稳定排序，无 Elasticsearch 或额外基础设施。

## 输入自动补全

投稿保持全屏双栏、左侧 Scroll Snap 与右侧独立滚动。地点单选、标签多选且最多 20 个，两者复用 CatalogAutocomplete；无展开箭头、无传统 Select、无“创建”或“使用输入文字”操作。空输入处于 idle，不展示全部选项；输入后 180ms 防抖请求，显示 loading、success、empty 或 error，错误可重试。AbortController 与请求存活标记防止过期响应覆盖新关键词。

地点 Placeholder 为“搜索拍摄地点...”，只有选候选才保存 locationId，选后显示名称，可清除或重新搜索。地点沿用选填规则，输入任意文本但未选择时仅作为搜索文字，提交 null。标签选择后清空搜索，显示可移除 Chip，已选 ID 排除出候选，Enter 只选已有高亮项；不把搜索文本创建成标签。中文输入法组词时 Enter 不触发选择。

ArrowDown/ArrowUp 移动高亮，Enter 选中，Escape 关闭，鼠标点击保持同样结果；input/listbox/option 使用 ARIA 控制关系与 active descendant。Radix Popover Anchor 跟随输入，Portal 脱离滚动容器，碰撞边界使用右侧滚动面板，限制可用高度并随滚动更新位置；不占用底部提交栏。焦点保留在输入框，键盘高亮项滚动可见。DOM 测试验证 portal 结构；实际几何、触摸与浏览器视觉需另行验收。

## 投稿与审核一致性

每张照片按稳定 UUID 独立保存 title/description/takenAt/locationId/tagIds，目录名称缓存只用于展示；切换照片只重置搜索 UI，已选 ID 不变。文件与元数据仍按原文件顺序关联，不依赖文件名；删除照片同时移除其草稿。

SubmissionService 验证 UUID、标签数组上限/唯一性、目录存在与启用状态；任意文本、伪造/禁用 ID 被拒绝。安全验证后、上传前检查一次，最后同步 SQLite 事务再检查一次，上传期间禁用也会拒绝。Submission、Photos、PhotoTags、限流与操作完成标记在同一短事务中提交；文件上传在事务外，失败沿用私有原图/预览补偿及 cleanup_failed 记录。新照片仍 pending，无公开对象，不创建目录。

审核详情/列表提供选中目录名称与 ID，编辑复用同一自动补全数据源；管理员创建目录在专用管理页完成。审核允许保留该照片已有禁用地点/标签，不能新增禁用选项；移除后仍可保存。locationId 未传时保留历史文本，显式 null 清除，新 ID 关联目录。PhotoTags 与元数据审计在同一事务中更新，记录变化名称和 ID。

## 迁移与历史兼容

`0007_crazy_red_ghost.sql` 为增量迁移，不改旧 Migration、不重建或删除原 photos/tags/photo_tags/submissions/moderation_logs。新增地点表与可空 location_id，保留原 location 字节文本。地点初始为空，由管理员维护；创建或重命名目录时仅关联尚未映射且规范化名称完全相等的历史照片，保留旧文本；相似名称不会合并。无法确定的旧地点继续显示原文，后续审核可手动选择规范地点。

历史标签规范化后同名时，以确定性 UUID 排序选一个规范候选；其余保留行、原名称、slug 和所有 PhotoTags，仅设为禁用历史别名，normalized_name 留空。恢复别名须先改为不冲突的名称；不会丢失任何照片关系或旧标签 URL。updated_at 回填 created_at。新目录通过服务写入规范化键并受唯一索引保护。

Docker 与原生 standalone/systemd 继续使用共用 BootstrapService，已有库升级前通过 SQLite Backup API 备份，再自动应用待执行迁移；失败不启动。迁移使用连接已注册的 normalize_location 函数，必须通过项目连接和迁移/Bootstrap 运行，勿直接执行裸 SQLite SQL。没有新配置、额外服务或真实云调用。

公开查询保持 approved 且衍生资源/发布时间完整。地点优先关联名称、回退旧文本，筛选沿用 URL location 参数并规范化有效名称；标签仍经 photo_tags，详情链接进入 /tags/[slug]。目录禁用不限制历史公开显示、筛选或标签页；pending/rejected/hidden 照片永远不会经目录关联公开。

## 验收步骤

使用独立临时 DATABASE_PATH 与 LOCAL_STORAGE_PATH，配置本地 loopback origin 和官方 Turnstile 开发测试凭据，执行 `pnpm dev` 自动初始化；不要把测试写入已有数据库。管理员首次改密后：

1. 在地点管理添加图书馆、勤学楼，在标签管理添加樱花、建筑、夜景；检查空名、重复名、排序和禁用/恢复反馈。
2. 投稿两张同名文件，分别搜索选择不同地点和多个标签；上下滚动、上一张/下一张，确认选项恢复；移除 Chip、删除一张再追加，确认关联不会错位。
3. 测试空输入、无结果、断网/重试、中文输入法、键盘上下/Enter/Escape；确认任意搜索文字不能成为目录选项。查看右侧底部和手机输入时建议面板定位。
4. 保持草稿时禁用已选项，提交应被服务端拒绝并保留草稿；恢复或移除失效选项后重新验证提交。照片保持 pending，仅私有原图/预览。
5. 审核详情查看/修改地点与标签，批准部分照片。公开 archive/photo/tags 显示正确名称，地点/标签组合筛选可用，pending 不公开。
6. 禁用已使用目录，历史公开照片仍显示；重命名反映在新请求。撤回照片后 archive/详情/标签页不再公开该照片；CDN purge 独立处理。

自动化采用临时 SQLite、local 存储或注入图片服务/mock 验证器；不连接真实 R2/生产 Turnstile。测试覆盖权限、规范化冲突、受限搜索、迁移升级、目录禁用、事务复核、多图关联、历史显示、审核编辑、自动补全状态/键盘/Chip/请求竞争以及编辑器滚动切换与删除后的 multipart。完整执行结果在本次交付报告中列出。项目当前没有 Playwright；DOM 与真实 standalone HTTP 检查不能代替浏览器几何和触摸验证。

## 本次检查结果（2026-10-12）

- pnpm check 通过：TypeScript、ESLint、Prettier、22 项 Node 测试和 183 项 Vitest；ESLint 0 错误，保留既有后台 5 条 img 警告。
- pnpm build 通过；构建后 pnpm test:auth-flow 的 10 项真实 standalone HTTP 测试通过，包含真实 Better Auth 目录权限、禁用/恢复、公开只读选项与 405 拒绝游客创建。
- pnpm db:generate 检查 Schema 与 0007 快照一致，无额外差异；pnpm db:compile 通过；pnpm db:migrate 在 /private/tmp 隔离库成功。首次/重复/历史库升级、规范化重复标签保留、Bootstrap 升级前备份和备份失败拒绝迁移由隔离自动化覆盖。
- 浏览器验收使用临时库、临时管理员和 local 测试图，未使用真实照片/云服务。内置浏览器不可用，Chrome 两次返回“Unable to load browser request-header policy”，因此没有完成真实桌面/手机布局、触摸与浮层几何验收；临时服务已关闭并清理。项目没有 Playwright。
- 未执行真实 R2、CDN purge 或生产 Turnstile 检查；沿用现有 mock 和隔离服务测试，不将模拟结果视作真实云验证。

实现核对了安装版 Next.js 16.4 的 Route Handlers、Server/Client Components 与 useRouter 指南，以及 Context7 的 Drizzle Migration、Radix Popover 和 Next.js router.refresh 文档。
