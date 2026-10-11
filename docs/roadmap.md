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

## 第三阶段：匿名投稿与私有图片

- [ ] R2 私有桶、文件大小/MIME/签名/解码像素/批次限额校验
- [ ] Turnstile 服务端验证、超时/重放与可靠匿名限流
- [ ] 私有原图保存、pending 记录、失败补偿与幂等
- [ ] 投稿表单真实结果、授权与隐私说明
- [ ] 确保未审核图和原图不能公开访问

## 第四阶段：审核与发布闭环

- [ ] 增量添加 reviewed_by，评估日志用户关联并保留历史
- [ ] 每个审核 API 独立鉴权、私有预览、批准/拒绝与备注
- [ ] Sharp 去 EXIF、展示图/缩略图发布、状态与日志事务
- [ ] R2 / SQLite 补偿与重试，下架/恢复及 CDN 缓存撤销
- [ ] 公开详情图片与实际统计数据

## 第五阶段：整理与长期部署

- [ ] 日期/地点/标签检索、游标分页、元数据编辑、分类维护
- [ ] Cloudflare Tunnel、域名与 HTTPS、不可绕过的可信入口
- [ ] SQLite / R2 备份恢复、容量监控与运维工具
- [ ] 多管理员、密码重置、MFA（按需求），认证 CLI/adapter 升级验证
- [ ] 浏览器响应式、主题、可访问性与安全全流程复核

第一版不包含普通用户注册、点赞、评论、关注、Redis、消息队列、微服务或 Monorepo。扩展基础设施应基于实际瓶颈。
