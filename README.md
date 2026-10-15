# SecondLook

做决定前，多看一面。查看具体对象的亲历记录，关注事情的后续变化。

安卓 / iOS App、配套网页和 API 共用一个仓库。当前为**本地最小闭环**，所有演示对象与经历均为虚构。

## 第一次启动

使用 Node.js 22（至少 22.13）和 npm 10。当前验证环境为 Node 22.23.2。

```sh
npm ci
npm run setup
npm run dev
```

- 网页：[http://localhost:5173](http://localhost:5173)
- API：[http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)
- `setup` 生成 Prisma Client、应用迁移、添加虚构数据。已有本地环境文件不会被覆盖。
- 演示账号为 `demo`、管理员为 `admin`，随机密码分别保存在 `apps/api/.env` 的 `SEED_DEMO_PASSWORD`、`SEED_ADMIN_PASSWORD` 中。
- 种子脚本重复运行不会重置既有账号密码。`.env`、数据库与上传材料不提交 Git。

## iPhone 与安卓开发

另开一个终端：

```sh
npm run dev:mobile
```

手机与电脑处于同一局域网，核对 `apps/mobile/.env` 中的 `EXPO_PUBLIC_API_URL`。手机不能用 `localhost` 访问电脑；电脑 IP 改变、多网卡或防火墙均可能影响连接。

iPhone 先用 Expo Go。按当前 Expo 官方说明，电脑 Expo CLI 与实体 iPhone 的 Expo Go 需要登录同一个 Expo 账号。登录和扫码在你自己的设备上完成，不把凭据写入代码。当前不使用 EAS 付费服务，也不做独立安装包、签名或上架。

安卓和 iOS bundle 已成功导出；尚未完成原生设备交互验收。网页的移动布局测试不能代替原生测试。

## 当前可以做什么

- 注册/登录；匿名或昵称发布文字亲历，投稿先审后发。
- 搜索与类别/城市筛选，查看对象汇总与经历详情。
- 管理员在 `/admin` 审核投稿和后续进展，保留审核记录。
- 关注经历，作者补充进展，审核后生成站内通知。
- 深色、浅色和跟随系统；网页键盘焦点、放大字号和减少动态效果适配。

尚未实现：图片上传、独立佐证与异议、证据标签状态管理、求助、地理附近、对象代表核验、举报申诉、原文修订版本及公网部署。现有公开记录均为“仅本人陈述”，不会假装已有证据核验能力。网页目前内存登录，刷新后需要重新登录。

## 常用命令

| 命令                                | 用途                                      |
| ----------------------------------- | ----------------------------------------- |
| `npm run setup`                     | 幂等初始化本地环境和演示数据              |
| `npm run dev`                       | 启动 API 与网页                           |
| `npm run dev:mobile`                | 启动 Expo                                 |
| `npm run typecheck`                 | 检查全部工程类型                          |
| `npm run lint`                      | App 的 Expo ESLint 检查                   |
| `npm test`                          | 后端集成测试，使用独立临时数据库          |
| `npm run build`                     | 构建网页                                  |
| `npm run export:mobile`             | 导出安卓与 iOS JS bundle，不生成安装包    |
| `npm run test:e2e`                  | 网页浏览器回归测试，启动独立 API 与数据库 |
| `npm run db:migrate -- --name 描述` | 修改 schema 后创建本地迁移                |

浏览器测试首次使用先运行 `npx playwright install chromium`。如果已有本地 Chrome，可以设置 `PLAYWRIGHT_CHANNEL=chrome` 后运行；例如 Linux/macOS：`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。测试默认使用端口 3101 和 5174，不占用正常演示数据库。端口已占用时可用 `SECONDLOOK_E2E_API_PORT` / `SECONDLOOK_E2E_WEB_PORT` 指定其他端口。测试截图与失败 trace 保存在 `apps/web/test-results`，不提交到 Git。

## 工程结构与文档

- `apps/mobile`：Expo Router / React Native，按页面和少量共享组件组织。
- `apps/web`：React 网页与后台；样式分为基础、布局、发现、表单详情、响应式五部分。
- `apps/api`：Express；路由处理输入，审核事务和公开 DTO 集中在业务模块。
- `packages/contracts`：共享请求校验、公开类型及轻量请求工具，不共享服务端模型。
- [产品需求](docs/product.md)、[开发方案](docs/development.md)、[实际进展与验证](docs/progress.md)。
- [Apple Design 技能全文](docs/design/apple-design-skill.md)、[产品 UI 规范](docs/design/ui-spec.md)。

本地 Git 已按步骤提交，尚未创建 GitHub 远程或推送；许可证待用户选择。Codex 侧栏项目注册需要在应用中添加此目录，现有工具不能替代该操作。
