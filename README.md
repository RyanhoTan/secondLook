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
- 按对象名称/地址或正文搜索，组合类别、城市与发生日期范围，按发布时间或发生日期排序；网页条件保存在 URL，可分享与前进后退。
- 发布时可搜索对象名称或门店地址并翻页选择；对象经历和“我的记录”支持分页，不局限于首批记录。
- 从发现页进入“查找具体对象”，独立检索包含零公开经历的对象；按名称/地址、类别和城市筛选，同名分店分别显示地址。网页和 App 路由保留对象检索条件，公开数量不代表对象整体评价。
- 管理员在 `/admin` 审核投稿和后续进展，保留审核记录。
- 关注经历，作者补充进展，审核后生成站内通知。
- 作者提交原文修订；审核后统一更新公开内容、置顶更正、保留版本历史并通知关注者。管理员可限制旧版本公开。
- 投稿可自动/手动保存多份私有草稿，从“我的草稿”继续编辑或核对投稿结果；同次提交不会生成重复帖子。已保存内容可重新登录后恢复；断网时未保存的修改仍须保持编辑页。
- 投稿按对象类别多选问题类型；标签跟随草稿、审核和正文修订，公开后可筛选。旧记录不自动补标签，分类不代表事实认定，也不影响证据状态。
- 投稿前可预览完整正文、具体对象和对外身份，返回修改保留输入；确认后再提交审核，预览本身不会创建帖子。
- 作者上传图片与来源说明，选择公开或仅供审核；管理员检查、遮挡隐私后发布副本。原件受限读取并留痕，作者可撤回材料。
- 深色、浅色和跟随系统；网页键盘焦点、放大字号和减少动态效果适配。

材料已关联具体正文版本：更正发布后重新审核，旧版审核结果只用于仍公开的历史版本；撤回或隐藏旧版后，相应图片链接不能继续读取。

尚未实现：独立佐证与异议、独立性与争议标签审核、求助、地理附近、对象代表核验、举报申诉。贡献与修订版本的关联仍待补齐；公网部署不属于本轮交付。虚构种子记录默认“仅本人陈述”；公开材料审核通过后可显示“已附材料”，不代表事实已经证实。网页目前内存登录，刷新后需要重新登录。

材料支持静态 JPEG、PNG、WebP，单张不超过 10MB、2000 万像素，每帖最多 6 份待审或通过的材料。提交经历后或在“我的记录”进入图片管理；后台 `/admin` 有独立材料审核区域。原件、审核预览和公开副本保存在被 Git 忽略的 `apps/api/uploads/`，没有静态目录入口。可通过 API 的 `UPLOAD_DIR` 设置其他本地存储位置；数据库与该目录需要一起备份，恢复工具尚待完成。

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
- [第一版完工验收清单](docs/acceptance.md)：统一范围、逐项状态、验收门槛与待决策事项。
- [产品需求](docs/product.md)、[开发方案](docs/development.md)、[实际进展与验证](docs/progress.md)。
- [Apple Design 技能全文](docs/design/apple-design-skill.md)、[产品 UI 规范](docs/design/ui-spec.md)。

本地 Git 已按步骤提交，尚未创建 GitHub 远程或推送；许可证待用户选择。Codex 侧栏项目注册需要在应用中添加此目录，现有工具不能替代该操作。
