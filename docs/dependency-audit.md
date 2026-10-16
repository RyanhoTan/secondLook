# 依赖审计与修复记录

日期：2026-10-17（Asia/Shanghai）。环境：Linux、Node 22.23.2、npm 10；依据当前 package-lock.json、实际 registry 审计与本地依赖/导出源码映射。**审计尚未通过，Q08 仍未验收。**

## 本次结果

| 阶段 | critical | high | moderate | 总计 | 命令结果 |
| --- | --- | --- | --- | --- | --- |
| Prisma 7.10.0 | 0 | 22 | 10 | 32 | npm audit 非零 |
| Prisma 7.10.1 | 0 | 18 | 10 | 28 | npm audit 非零 |

这里的数量是 npm 报告的受影响包节点数，含受传递依赖影响的父包，不能解释成 28 个相互独立的漏洞。安装时没有运行 audit 的摘要不作为审计通过依据，也没有用 omit、severity 阈值、忽略列表或强制降级让结果变绿。

## 已完成的兼容补丁

三个直接包 `prisma`、`@prisma/client`、`@prisma/adapter-better-sqlite3` 从 7.10.0 同步固定为 7.10.1，保持主版本与 SQLite 方案。[上游发布标签](https://github.com/prisma/orm/releases/tag/7.10.1)。已检查引擎要求支持当前 Node 22.23.2，并重新生成 Client。

- `@prisma/config → deepmerge-ts`：7.1.5 更新到 8.0.2，消除递归对象合并耗尽栈的告警。[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)。该路径由 CLI 配置依赖带入，当前 API 使用 SQLite；没有自行覆盖上游依赖主版本。
- `prisma → mysql2`：3.15.3 更新到 3.24.4，审计不再报告认证降级/压缩数据解压相关告警。[认证告警](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)、[解压告警](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)。mysql2 是 Prisma 工具依赖，项目没有改用 MySQL。
- 消失的 4 个审计节点为 prisma、@prisma/config、deepmerge-ts、mysql2。锁文件中的其他变化限于 Prisma 配套包及 mysql2 的依赖；Expo、React Native、Router 与 Web 包版本未改变。
- `@prisma/engines-version` 的内部标记由上游补丁指定为 `8.1.0-1.d1b3f377ca835d73fd50954a5e22128b9ebdd6b8`；三个直接包仍为 7.10.1，未手动替换引擎依赖。Client 生成、从空库部署全部迁移及后端回归实际通过。

## 剩余的源告警与处理入口

| 叶子依赖 / 当前版本 | 当前依赖路径和观察 | 修复状态与下一步 |
| --- | --- | --- |
| braces 3.0.3（high） | Expo/React Native → Metro/metro-file-map → micromatch 4.0.8 → braces；处理文件匹配模式 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 当前没有列出修补版本。等待维护者修复或评估受支持工具链升级；不强制降到 Expo 44/RN 0.72 来绕开依赖路径。 |
| node-forge 1.4.0（high） | @expo/cli 57.0.30 和 @expo/code-signing-certificates 0.0.6 引入；本地源码中存在证书/签名校验调用 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) 当前没有列出修补版本。需在上游修复后回归 Expo CLI/签名相关流程；未因为项目不做上架就判定无风险。 |
| decode-uri-component 0.2.2（moderate） | Expo Router 57.0.27 → query-string 7.1.3 → decoder；Router 的 getStateFromPath/getPathFromState 引用了 query-string，两端原生 source map 都包含 decoder | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) 修补版为 0.5.0。当前 query-string 要求 ^0.2.2；审计建议 Router 58.0.22，是跨主版本建议，尚未作为 SDK 57 兼容方案验证。需评估回补或配套 SDK/Router 升级，并覆盖异常深链接与设备操作；不能仅算作 dev 风险。 |
| uuid 7.0.3（moderate） | Expo config-plugins → xcode 3.0.1 → uuid ^7.0.3；本地 xcode/lib/pbxProject.js 核对到的是 uuid.v4 调用，应用自己的 UUID 另用 Node/Expo Crypto | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) 影响 v3/v5/v6 的外部缓冲区写入，修补版本含 11.1.1。当前观察到的 v4 路径与该条件不同，但不删除包级告警；需由 xcode/配置插件兼容升级处理，不能直接假定换成 uuid 11 无兼容影响。 |

以上是本次范围内的路径观察，不是对所有工具命令、平台、输入或利用条件的证明，也不是安全豁免。源公告可更新，重新验收时须再次获取审计数据。

## 原生包内核对

实际运行（CLI 参数已按当前安装版本的 --help 核对）：

```sh
npm exec -w @secondlook/mobile -- expo export --platform android --platform ios --source-maps --output-dir /tmp/secondlook-audit-export
```

递归读取两份 `.hbc.map` 的 sources/sections，结果：

| 导出 | sources 数 | query-string / decoder | braces / node-forge / uuid |
| --- | --- | --- | --- |
| Android | 1390 | 均出现 | 均未出现 |
| iOS | 1256 | 均出现 | 均未出现 |

“出现”只证明该次导出包含模块，不证明已经利用或每条路径都会调用；“未出现”只适用于此次原生导出，不能排除 CLI/开发服务风险。源码映射、原始审计 JSON、安装输出均为本地诊断产物，未提交。未进行真实设备异常深链接测试。

## 剩余 28 个审计节点

high（18）：@expo/cli、@expo/code-signing-certificates、@expo/metro、@expo/metro-config、@react-native/community-cli-plugin、@react-native/metro-config、@react-native/virtualized-lists、braces、expo、metro、metro-config、metro-file-map、metro-transform-worker、micromatch、node-forge、react-native、react-native-reanimated、react-native-worklets。

moderate（10）：@expo/config、@expo/config-plugins、@expo/inline-modules、@expo/local-build-cache-provider、@expo/prebuild-config、decode-uri-component、expo-router、query-string、uuid、xcode。

## 验证与复查

- `npm install --ignore-scripts --no-audit --no-fund` 更新精确版本及锁文件；它没有产生“审计通过”结论。
- 两次独立执行 `npm audit --json`，依据实际终止结果读取报告；升级后仍非零，18 high / 10 moderate。
- `npm run db:generate`、全部工作区 typecheck、App lint、138 项 API 测试、Web build、Android/iOS JS bundle 导出通过。
- 完整 32 组 Chrome 回归通过（约 1.6 分钟），覆盖发布、审核、材料、修订、草稿、订阅及通知；备份恢复与空库迁移包含在后端测试内。
- 没有迁移改动、业务规则变更、数据库/图片入库或部署。Web 原有块大小/Zod 注释提示仍在，原生真机与 Safari/WebKit 尚未验证。Q08 需要继续处理上述剩余风险和最终独立 review，不能仅凭本次回归打勾。
