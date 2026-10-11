# 开发路线图

## 第一阶段：可靠基础（已完成）

- [x] Git、pnpm、Next.js、TypeScript、Tailwind、shadcn/ui、Lint/Prettier
- [x] SQLite / Drizzle 五张业务表与初始 Migration
- [x] 页面骨架、主题、空状态、公开查询隐私边界
- [x] R2 / Sharp / Turnstile / 投稿 / 审核接口预留，Docker 持久化与中文文档

## 第二阶段：管理员认证与访问控制（已完成）

- [x] Better Auth 1.7.7 + Drizzle Adapter、Email + Password，禁止公开注册
- [x] Admin Plugin、官方 CLI 安全初始化首个管理员、UUID 身份
- [x] 认证增量迁移、保留原业务记录与历史 Migration
- [x] 登录、失败提示、加载/防重复、密码显示、退出
- [x] 后台布局与各叶子页面服务端保护、登录页独立
- [x] 统一 Session / 401 / 403 与 `/api/admin/me`，精简 DTO
- [x] 固定 origin、HTTPS Cookie、CSRF、回调检查与持久化登录限流
- [x] 独立测试数据库的认证安全测试及真实生产服务 HTTP 流程

没有创建真实管理员；需由维护者执行 `pnpm admin:init`。浏览器视觉与交互检查限制见 validation 文档。密码重置、多管理员管理与 MFA 尚未实现，后续按运维需求单独规划。

## 第三阶段：图片存储与处理基础设施（已完成）

- [x] 双桶 R2 客户端、LocalStorage、统一 ObjectStorage 与服务端配置
- [x] UUID Key 白名单、路径/符号链接隔离、私有原图不可变
- [x] JPEG/PNG/WebP 内容/大小/像素/完整解码验证与基础元数据
- [x] Sharp 方向、比例、WebP 展示/缩略/私有预览和元数据移除
- [x] ImageService 文件发布、撤回、幂等删除，SQLite 操作记录与显式恢复
- [x] 增量 preview_key 与 image_operations，不重建业务表
- [x] 管理员私有预览 API，本地获批公开衍生图只读 API，URL 生成
- [x] Vitest 临时存储/数据库和 R2 mock、实际 HTTP 图片与认证回归
- [x] 中文 R2 手动配置、连接探测、备份、成本和 CDN 限制文档

未调用真实 R2，未开放上传/发布/删除接口，未接入图片 UI；云权限、公开策略和 CDN 仍待配置后实测。

## 第四阶段：匿名投稿（已完成）

- [x] 52 MiB 请求体、50 MiB 批次、单张 10 MiB、最多 5 张及有界图片处理
- [x] 匿名投稿表单、拖拽/追加/删除/预览、逐张元数据和授权说明
- [x] 通过 ImageService 保存私有原图/预览，事务写 pending 与批次
- [x] Siteverify 的 hostname/action 校验、SQLite HMAC 限流、Origin 检查
- [x] 失败补偿、孤立对象操作记录和 requestId 幂等保护

本阶段没有调用真实 Cloudflare；本地和 Vitest 使用官方测试密钥形态或注入验证器。投稿成功不等于公开，仍没有匿名发布或删除接口。

## 第五阶段：审核与发布闭环

- [ ] 增量添加 reviewed_by，评估日志用户关联并保留历史
- [ ] 每个审核 API 独立鉴权、私有预览、批准/拒绝与备注
- [ ] 将现有 ImageService 发布 receipt 接入状态与日志事务
- [ ] R2 / SQLite 补偿与重试，下架/恢复及 CDN 缓存撤销
- [ ] 公开详情图片与实际统计数据

## 第六阶段：整理与长期部署

- [ ] 日期/地点/标签检索、游标分页、元数据编辑、分类维护
- [ ] Cloudflare Tunnel、域名与 HTTPS、不可绕过的可信入口
- [ ] SQLite / R2 备份恢复、容量监控与运维工具
- [ ] 多管理员、密码重置、MFA（按需求），认证 CLI/adapter 升级验证
- [ ] 浏览器响应式、主题、可访问性与安全全流程复核

第一版不包含普通用户注册、点赞、评论、关注、Redis、消息队列、微服务或 Monorepo。扩展基础设施应基于实际瓶颈。
