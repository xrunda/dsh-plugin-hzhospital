# 菏泽市中医医院 DSH 品牌插件

将 DeepSeek Harness 左上角的官方品牌替换为菏泽市中医医院 Logo。展开侧栏显示院徽和院名，折叠侧栏显示院徽；保留原有新会话、展开侧栏和窗口拖动行为。

## 安装

将仓库内容提交并推送到 Git 服务后，在 DSH「插件 → 添加插件」输入：

```text
https://github.com/xrunda/dsh-plugin-hzhospital.git
```

安装后启用插件，刷新客户端；必要时重启 DSH。命令行安装（将 `<profile>` 替换为实际客户端使用的 profile，例如 `desktop`）：

```sh
dsh plugin --profile <profile> add https://github.com/xrunda/dsh-plugin-hzhospital.git
```

仓库提交了 `lib/client.js`，没有需要单独下载安装的运行时依赖（复用 DSH 提供的 Typert 和 Zod），没有安装脚本，无需 TypeScript 编译或安装构建工具。请勿删除该产物。

## 检查和更新版本（1.1.1 起）

无需改动 DSH 源码或安装包。医院插件自己提供检测、提示和按钮，通过 DSH 当前安装管理器执行包安装。

- 插件在 DSH 客户端加载、更新 RPC 就绪后自动检查一次，不用先打开详情页；客户端连接重新建立时也会按需复查。
- 打开本插件详情页时触发检查；距上次检查不足 15 分钟则复用结果。这里是事件触发的缓存，没有定时轮询。
- 详情页提供“检查更新”，手动点击跳过缓存。有新版时出现“更新到 x.y.z”按钮，院名旁也会显示绿色提示点。
- 通过 Git smart-HTTP 读取仓库 `main` 的提交，再读取该提交对应的 `package.json`；只接受高于当前版本的正式版本号。相同版本的代码变化不会触发更新，发布时必须提高版本号。
- 点击更新会安装检测到的确切提交，不会跟随安装期间变动的分支。更新时不运行包安装脚本，不卸载运行中的插件；成功后提示完全退出并重开 DSH。
- 多个页面的检测合并为一个请求。GitHub 限流、超时或断网会显示检查失败，Logo 继续工作。

当前实现直接读取 Git 安装源的提交信息，再通过 `raw.githubusercontent.com` 读取该提交的版本文件，不使用 GitHub 公共 API，不需要 GitHub Token 或额外的 Git 命令。检测和安装需要能访问 GitHub 及其下载服务。没有额外的更新目录或自建服务器。内网 Git 镜像或离线安装仍可使用 Logo，但本版本的检测源固定为此 GitHub 仓库，不会自动跟随镜像地址。

**第一次升级到 1.1.2：** 1.0.x 尚无此更新界面，请在 DSH 中卸载旧版，再通过同一 Git 地址安装最新版（1.1.2）并重启。以后可使用插件自己的按钮更新。

DSH `installBundle()` 在 HMR 模式会拒绝覆盖已安装包。本插件因此在宿主侧复用 DSH 的 `change/configure/runPnpm` 事务方法，持有相同的 profile 文件锁及 HMR 排他锁，安装后要求重启，不调用 `removeBundle()` 或主动重载自身。失败时通过 DSH 的恢复方法还原依赖记录和锁文件。**这些事务方法属于版本相关的宿主接口**；最低支持 0.2.1-rc.3；已在 0.2.1-rc.5 验证，并核对官方 rc.3 发布包的相关接口产物与其完全一致，后续 DSH 接口变化可能需要适配插件。方法缺失时不提供一键更新，Logo 和检查功能保留。没有替换、注入或修改任何 DSH 本体文件。

## 内网部署

Logo 已保存为 `assets/hztxt_logo.png`，并以 PNG data URI 内嵌在浏览器产物中。运行时不请求图片来源网站、CDN 或字体服务。

**Git 安装仍要求安装机器能访问 Git 服务。** 医院完全断网时，请把本仓库同步到医院内网 Git，再在添加插件处输入内网 `.git` 地址；外网 GitHub 地址无法在完全断网的机器上拉取。

也可以在本仓库运行 `npm pack`，将生成的 `dsh-plugin-hzhospital-1.1.2.tgz` 拷入内网，在添加插件处输入该文件的绝对路径，或执行：

```sh
dsh plugin --profile <profile> add /absolute/path/dsh-plugin-hzhospital-1.1.2.tgz
```

## 兼容范围与工作方式

实现依据官方 2026-10-31 文档与源码中的客户端品牌契约，面向包含以下接口的 DSH Web / 桌面客户端：

- 应用配置含 `ui-brand-official` 行；
- 支持 `dsh.bundle`、`dsh.client` 和 `window.__ModuleLoader__.load`；
- 支持 `sidebar.brand.mark`、`sidebar.brand.name` 与 `ctx.slots.inject()`。

组合包通过 `cordis.patch.yml` 停用 `ui-brand-official` 行，并插入独立的 `hzhospital-brand` 行。DSH 的 patch `name` 是匹配校验，不能用来替换已有行的模块名。此方式保留侧栏外壳及交互；卸载本组合包后，配置重新组合，恢复官方品牌。插件未启用或更改尚未同步的页面可能需要刷新。

该配置面向含官方品牌行的 profile；精简 profile 缺少该行时，停用操作会提示未匹配，但医院插件仍会独立插入。更晚加载的用户 patch 可能覆盖停用设置；曾配置过 `brand-custom` 等品牌插件时，应停用它们，避免同时注册品牌插槽。

Logo 原图为 4140 × 640 PNG（白底）。使用 CSS 裁切同一张原图显示院徽与文字，不修改图片字节；深色主题保留原图白底。侧栏中图片高 24px，总宽约 155px。

已完成单元测试，并在本机 DSH 0.2.1-rc.5 的真实客户端 RPC、宿主 Gateway、事务锁与文件恢复代码上进行临时 profile 集成检查；网络响应和包下载在该集成检查中使用测试替身。未在医院实际 DSH 客户端中完成安装验收。应在目标客户端检查安装、启用、展开/折叠、深浅主题及卸载恢复。

## 开发

需要 Node.js 20+，不需要 `npm install`：

```sh
npm run build
npm run check
npm test
npm pack --dry-run
```

修改 `src/client.cjs` 或 Logo 后重新构建，并一起提交 `lib/client.js`。如果换图尺寸不同，需要同步调整源码中的比例及构建脚本的尺寸校验。

## 参考

- [第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [打包与安装](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)
- [官方品牌插件源码](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-brand-official)
- [客户端模块及资源协议](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules)
- [Logo 来源](https://res.xrunda.com/HZhospital/hztxt_logo.png)

## 1.0.1 修复说明

修复 1.0.0 将 patch 的 `name` 误当作模块替换字段、导致 DSH 跳过插件的问题。已使用本机 DSH 0.2.1-rc.5 自带的真实 patch 函数复现并验证修复。已安装 1.0.0 的用户请卸载后重新从 Git 地址安装，并清理 profile 中旧品牌插件的启用配置。

本机 DSH 安装包回归检查（macOS；读取安装包内真实 patch 函数，不启动会话）：

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" scripts/check-dsh-runtime.mjs
```

更新功能集成检查（只使用临时 profile，不更改用户配置或 DSH 本体）：

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" scripts/check-update-runtime.mjs
```

## 1.1.2 医院 DSH 兼容修复

1.1.1 的 Typert peer 要求误设为 `>=0.2.1-rc.5`，使医院 DSH `0.2.1-rc.3` 在安装阶段被拒绝。1.1.2 将已核对的最低版本调整为 `>=0.2.1-rc.3 <0.3.0`，无需升级 DSH 或使用兼容性豁免。官方 rc.3 发布包中的 RPC、Typert 注册表、安装管理器产物，与已通过集成检查的本机 rc.5 对应产物逐字节一致；插件详情页扩展插槽契约也一致；医院 Windows 客户端仍需实际安装验收。

安装条件回归检查（调用 DSH 自带的真实检查器）：

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" scripts/check-compatibility.mjs
```

如需复核官方包产物，可将 rc.3 npm tarball 解压为 `<目录>/<包名>/package/`，将该目录作为脚本参数。脚本会检查协议、注册表、Gateway、安装管理器和插件详情页产物的相关接口是否与本机已验证版本一致。
