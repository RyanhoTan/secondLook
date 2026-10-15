# SecondLook

帮助人们在做决定前，查看亲历记录、材料状态与后续变化。

本地开发中的安卓 / iOS App 与配套网页。**仅使用虚构演示数据。**

## 工程

- `apps/mobile`：Expo / React Native App
- `apps/web`：React 网页与管理后台
- `apps/api`：Express / Prisma / SQLite
- `packages/contracts`：共享协议和校验
- `docs`：产品需求、开发方案和验证记录

## 开发

Node.js 22（至少 22.12），npm 10。安装：`npm install`。

`npm run dev` 启动 API 与网页；`npm run dev:mobile` 启动 Expo。
`npm run typecheck` 检查类型；`npm test` 运行后端测试；`npm run build` 构建网页。

初始化数据库、账号和手机连接说明将在相应功能交付时补齐。
