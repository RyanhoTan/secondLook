# 项目约定

- 产品需求见 docs/product.md，开发方案见 docs/development.md。
- 当前为本地开发，不部署、不上架、不推送 GitHub。
- 全部使用 TypeScript；按业务模块组织，避免巨型文件与无意义抽象。
- 完成一个可验收步骤后，执行适用的类型、测试与构建检查，review 差异，再按 commit 技能创建中文 Conventional Commit；提交后核对编码。
- 界面遵循 apple-design 技能，支持深色、浅色和跟随系统；使用系统字体、克制的色彩与即时反馈；适配减少动态效果。
- 测试聚焦权限、匿名保护、发布版本、审核、关注通知和回归；没有实际运行不得声称通过。
- 使用虚构演示数据；数据库、图片、凭据不得提交。
- AI 负责实现、review、测试和修复；产品歧义由用户决定。

- UI 实现前阅读 docs/design/ui-spec.md；完整技能来源保存在 docs/design/apple-design-skill.md。按验收清单核对，不以配色、圆角或静态装饰代替技能要求。
