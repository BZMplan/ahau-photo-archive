# 开发路线图

## 自动初始化与管理员设置（已实现）

- [x] Docker 与 systemd 共用启动前 Bootstrap；首次建库/存储/管理员，已有库升级前在线备份
- [x] 持久认证密钥指纹、随机初始凭据受保护文件与服务端首次改密门禁
- [x] 管理员设置：当前账户显示名称、登录邮箱及密码，密码修改撤销其他 Session
- [x] 可信本地管理员凭据领取与忘记密码恢复，不开放匿名初始化/恢复接口
- [ ] 正式环境 R2 权限、真实域名代理与浏览器端验收

详见 [初始化指南](initialization.md)。

## 生产部署方式（已扩展）

- [x] Docker Compose：持久卷、显式 Migration、在线备份/恢复和健康检查
- [x] 原生 Linux：Standalone 打包、同一 Migration/备份/恢复脚本、systemd 服务模板与版本目录更新流程
- [ ] 目标 Linux 主机上的 systemd、外部 HTTPS 代理、真实 R2/Turnstile 与浏览器验收，由部署者执行

两种部署方式共用应用及安全边界；分别见 [Docker 部署](deployment.md)和[原生部署](deployment-native.md)。

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

历史阶段完成时未创建真实管理员；当前首次启动会自动建立。浏览器视觉与交互检查限制见 validation 文档。密码重置、多管理员管理与 MFA 尚未实现，后续按运维需求单独规划。

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

## 第五阶段：审核与发布闭环（已完成）

- [x] `0004` 增量添加 reviewed_by、reviewed_at、rejection_reason、publication_id 和 metadata_changes
- [x] 每个审核 API 独立鉴权、私有预览、批准/拒绝、隐藏/恢复与备注
- [x] 将 ImageService versioned publication receipt 接入状态与日志事务
- [x] R2 / SQLite 补偿记录、条件更新、并发冲突与失败恢复
- [x] 管理后台审核队列、详情、元数据/标签编辑、审核历史和真实状态统计
- [x] 可选 Cloudflare URL 级 CDN purge，未配置/失败显式返回，不伪称即时失效

本阶段仍没有提供游客发布、删除或原图下载接口。真实 R2、Cloudflare purge 和浏览器视觉验收需在配置生产凭据后由维护者执行。

## 第六阶段：公开展示与归档（已完成）

- [x] 首页、档案、照片详情、标签公开页面和设计空状态
- [x] 年份/季节/规范化地点/标签组合 SQL 筛选、稳定排序和服务端页码分页
- [x] approved 白名单 DTO、标签批量读取、动态查询与撤回 404
- [x] 保留比例的响应式网格、加载/失败占位、键盘大图查看器、浅色/深色
- [x] Metadata、公开 OG、动态 sitemap/robots、隔离数据测试和验收文档

当前未保存摄影 EXIF，不读取原图补齐。无地图、复杂搜索或社交功能。浏览器触摸、真实 R2 与 CDN 验收仍需上线前完成。

## 第七阶段：Docker 容器化部署与生产环境配置

Docker Compose 单实例部署能力已实现，公网入口仍由用户自行配置的外部 HTTP/HTTPS 反向代理提供，本项目不管理代理或证书。真实 R2 权限、正式域名代理和浏览器验收仍需部署者在其环境执行。

- [x] 多阶段 Debian slim Dockerfile、Next.js standalone 与原生模块运行检查
- [x] 单实例 Docker Compose、回环端口、受控 Docker 网络接入说明
- [x] SQLite 与 local 图片持久卷、共用 Migration 和在线备份/恢复工具
- [x] 生产环境变量整理；投稿页在运行时读取公开 Turnstile Site Key
- [x] 容器健康检查、Docker 日志轮转、重启策略及非 root 安全选项
- [x] 代理兼容要求：HTTPS 公开 URL、可信来源、上传大小和超时
- [ ] 在正式域名与真实 R2 环境验证代理链路、桶权限和浏览器全流程

## 第八阶段：备份、监控和性能优化（可选）

- [ ] SQLite / R2 备份与恢复演练、容量监控
- [ ] 失败的图片操作和 CDN purge 任务监控、性能瓶颈评估
- [ ] 多管理员、邮件验证、MFA 与认证 CLI/adapter 升级验证，按实际运维需求另行规划

第一版不包含普通用户注册、点赞、评论、关注、Redis、消息队列、微服务或 Monorepo。扩展基础设施应基于实际瓶颈。
