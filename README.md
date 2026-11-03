# 菏泽市中医医院 DSH 品牌插件

将 DeepSeek Harness 左上角的官方品牌替换为菏泽市中医医院 Logo。展开侧栏显示院徽和院名，折叠侧栏显示院徽。空会话欢迎页的官方鲸鱼标志和“探索未至之境”标题也替换为“菏泽市中医医院”文字，保留“预览版”徽标。保留原有新会话、展开侧栏和窗口拖动行为。

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
- 多个页面的检测合并为一个请求。更新源限流、超时或断网会显示检查失败，Logo 继续工作。

检测源为公司 GitLab 仓库 `https://git.xrunda.com/mdt/dsh-plugin-hzhospital.git`（1.1.6 起；1.1.1—1.1.5 固定为 GitHub）。优先通过 HTTP 读取 Git 提交信息和 GitLab `/-/raw/` 上的版本文件；HTTP 检查失败时，沿用 1.1.3 引入的 Git 命令回退，通过同一 `.git` 地址读取版本，继承 DSH 安装器环境及 Git 自身的代理设置。不使用平台 API，也不需要 Token。Git 回退需要安装插件时使用的 Git 命令仍可用。检测和安装需要能访问公司 GitLab；GitHub 镜像仅用于开发同步，插件不会从 GitHub 检查或下载。没有额外的更新目录或自建服务器。

**第一次升级到更新功能版：** 1.0.x 尚无此更新界面，请在 DSH 中卸载旧版，再通过同一 Git 地址安装最新版（1.1.6）并重启。以后可使用插件自己的按钮更新。

DSH `installBundle()` 在 HMR 模式会拒绝覆盖已安装包。本插件因此在宿主侧复用 DSH 的 `change/configure/runPnpm` 事务方法，持有相同的 profile 文件锁及 HMR 排他锁，安装后要求重启，不调用 `removeBundle()` 或主动重载自身。失败时通过 DSH 的恢复方法还原依赖记录和锁文件。**这些事务方法属于版本相关的宿主接口**；最低支持 0.2.1-rc.3；已在 0.2.1-rc.5 验证，并核对官方 rc.3 发布包的相关接口产物与其完全一致，后续 DSH 接口变化可能需要适配插件。方法缺失时不提供一键更新，Logo 和检查功能保留。没有替换、注入或修改任何 DSH 本体文件。

## 内网部署

Logo 已保存为 `assets/hztxt_logo.png`，并以 PNG data URI 内嵌在浏览器产物中。运行时不请求图片来源网站、CDN 或字体服务。

**Git 安装仍要求安装机器能访问 Git 服务。** 医院完全断网时，请把本仓库同步到医院内网 Git，再在添加插件处输入内网 `.git` 地址；外网 GitHub 地址无法在完全断网的机器上拉取。

也可以在本仓库运行 `npm pack`，将生成的 `dsh-plugin-hzhospital-1.1.6.tgz` 拷入内网，在添加插件处输入该文件的绝对路径，或执行：

```sh
dsh plugin --profile <profile> add /absolute/path/dsh-plugin-hzhospital-1.1.6.tgz
```

## 兼容范围与工作方式

实现依据官方 2026-10-31 文档与源码中的客户端品牌契约，面向包含以下接口的 DSH Web / 桌面客户端：

- 应用配置含 `ui-brand-official` 行；
- 支持 `dsh.bundle`、`dsh.client` 和 `window.__ModuleLoader__.load`；
- 支持 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark` 与 `ctx.slots.inject()`。

组合包通过 `cordis.patch.yml` 停用 `ui-brand-official` 行，并插入独立的 `hzhospital-brand` 行。DSH 的 patch `name` 是匹配校验，不能用来替换已有行的模块名。此方式保留侧栏外壳及交互；卸载本组合包后，配置重新组合，恢复官方品牌。插件未启用或更改尚未同步的页面可能需要刷新。

该配置面向含官方品牌行的 profile；精简 profile 缺少该行时，停用操作会提示未匹配，但医院插件仍会独立插入。更晚加载的用户 patch 可能覆盖停用设置；曾配置过 `brand-custom` 等品牌插件时，应停用它们，避免同时注册品牌插槽。

Logo 原图为 4140 × 640 PNG（白底）。使用 CSS 裁切同一张原图显示院徽与文字，不修改图片字节；深色主题保留原图白底。侧栏中图片高 24px，总宽约 155px。

欢迎页标题没有独立的插槽：官方把 `hero.headline` 文案直接写死在标题行里，只开放了鲸鱼标志的 `conversation.hero.brand.mark`。本插件占用该插槽渲染院名，并注入一段只作用于标题行的 `<style>` 隐藏原文案，因此“预览版”徽标位置不变。目前存在两种标题行结构：0.2.1-rc.5 的 flex 布局把标题文字放在 `_titleGroup` 内一个无 class 的 span 中，较早的构建则是三列 grid 并使用 `_headlineText`；插件同时匹配两者。选择器按 CSS Module 类名的后缀匹配，DSH 重新构建改变哈希前缀时仍然有效；若官方再次调整标题行的类名或结构，需要同步更新 `src/client.cjs` 中的 `heroCss`。

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

## 提交与双仓库推送规范

以本地提交为准，通过 `origin` 同时推送到以下两个仓库：

- GitHub：`https://github.com/xrunda/dsh-plugin-hzhospital.git`
- 公司 GitLab：`https://git.xrunda.com/mdt/dsh-plugin-hzhospital.git`

当前本地仓库已配置 `origin` 的两个推送地址，默认推送远程为 `origin`；拉取仍从 GitHub 获取。日常修改完成后，检查变更并提交，再执行一次推送：

```sh
git status
git add <本次需要提交的文件>
git commit -m "说明本次修改"
git push origin main
```

`git push origin main` 会依次向 GitHub 和 GitLab 推送 `main` 分支。其他分支将 `main` 替换为实际分支名；首次推送新分支可使用 `git push -u origin <分支名>`。已有上游分支时，直接执行 `git push` 也会通过 `origin` 推送两边。标签需单独执行 `git push origin --tags`。

两个仓库分别认证，推送结果也相互独立：一边失败不会回滚另一边。每次应确认两边均成功；处理网络、认证或分支冲突后，重新执行同一条推送命令即可补齐。不要用强制推送处理普通同步失败。保留的 `gitlab` 远程可用于单独补推，例如 `git push gitlab main`，但该命令只更新 GitLab。

尽量在本地统一修改、提交和推送，避免分别在两个平台网页上修改同一分支。网页提交不会自动同步到另一边；如在 GitHub 网页上修改，先在本地执行 `git pull --ff-only origin main`，再执行双仓库推送。

### 新克隆或其他开发机器配置

远程推送配置保存在本地 `.git/config`，不会随 README 或提交传播。新克隆仓库后，在项目目录执行以下命令配置；这会将 `origin` 的推送目标明确设为上述两个仓库，重复执行不会累加地址：

```sh
git config --local --replace-all remote.origin.pushurl https://github.com/xrunda/dsh-plugin-hzhospital.git
git config --local --add remote.origin.pushurl https://git.xrunda.com/mdt/dsh-plugin-hzhospital.git
git config --local remote.pushDefault origin
```

验证推送目标：

```sh
git remote get-url --push --all origin
```

输出应包含 GitHub 和 GitLab 两个地址。此配置同步 Git 提交、分支及显式推送的标签，不同步 Issues、PR 或平台设置。

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

## 1.1.3 网络检查修复

1.1.2 仅使用 HTTP 检查，失败时只显示 `fetch failed`，无法定位具体步骤。1.1.3 增加两项能力：

- HTTP 失败时回退到 Git 安装源：`ls-remote` 读取提交，在临时目录中浅拉取指定提交，只读取 `package.json`。不检出或执行仓库代码，不运行 Git hooks，不更改用户 Git 配置或 DSH 本体；结束后清理临时目录。
- HTTP 和 Git 都失败时，显示失败的 HTTP 主机及 DNS、超时、连接重置、证书等诊断，同时显示 Git 回退的失败类型。不会回显代理账号或密码，也不通过关闭证书校验解决问题。

同一网络不意味着 Git、Node HTTP 请求和不同 GitHub 域名的可达性相同。本地已验证 HTTP 故障回退场景，并通过真实 Git 安装源读取版本；医院机器的实际网络原因仍需依据新版诊断确认。

## 1.1.4 欢迎页品牌替换

空会话欢迎页把官方鲸鱼标志、“探索未至之境”标题和“预览版”徽标排在同一行，其中只有鲸鱼标志有插槽。1.1.4 占用 `conversation.hero.brand.mark` 渲染“菏泽市中医医院”文字，并用一段仅匹配该标题行的样式隐藏官方标题、收拢网格列；徽标保持原位。侧栏品牌和版本检查/更新功能不变。

## 1.1.5 欢迎页标题结构修复

1.1.4 只匹配了三列 grid 布局的 `_headlineText`，而实际运行的 DSH 0.2.1-rc.5 使用 flex 布局：标题文字位于 `_titleGroup` 内一个无 class 的 span 中，因此官方标题仍显示在院名旁边。1.1.5 增加 `_titleGroup` 内紧邻“预览版”徽标的标题 span 的隐藏规则，同时保留旧结构选择器；院名与“预览版”徽标布局不变。
## 1.1.6 更新源切换到公司 GitLab

1.1.1—1.1.5 的检测与安装源固定为 GitHub，医院内网访问 GitHub 不稳定。1.1.6 把版本检查（Git smart-HTTP + `/-/raw/` 文件读取）、Git 命令回退和一键更新的 `pnpm add` 安装地址全部切换为公司 GitLab 仓库 `https://git.xrunda.com/mdt/dsh-plugin-hzhospital.git`，与代码来源一致；不使用平台 API 或 Token。GitHub 仓库继续作为开发镜像双向同步，但插件不再从 GitHub 检查更新。已在 GitLab 上验证 smart-HTTP 与 raw 端点行为一致。
