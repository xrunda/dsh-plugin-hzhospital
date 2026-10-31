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

仓库提交了 `lib/client.js`，没有运行时依赖，没有安装脚本，无需 TypeScript 编译或安装构建工具。请勿删除该产物。

## 内网部署

Logo 已保存为 `assets/hztxt_logo.png`，并以 PNG data URI 内嵌在浏览器产物中。运行时不请求图片来源网站、CDN 或字体服务。

**Git 安装仍要求安装机器能访问 Git 服务。** 医院完全断网时，请把本仓库同步到医院内网 Git，再在添加插件处输入内网 `.git` 地址；外网 GitHub 地址无法在完全断网的机器上拉取。

也可以在本仓库运行 `npm pack`，将生成的 `dsh-plugin-hzhospital-1.0.0.tgz` 拷入内网，在添加插件处输入该文件的绝对路径，或执行：

```sh
dsh plugin --profile <profile> add /absolute/path/dsh-plugin-hzhospital-1.0.0.tgz
```

## 兼容范围与工作方式

实现依据官方 2026-10-31 文档与源码中的客户端品牌契约，面向包含以下接口的 DSH Web / 桌面客户端：

- 应用配置含 `ui-brand-official` 行；
- 支持 `dsh.bundle`、`dsh.client` 和 `window.__ModuleLoader__.load`；
- 支持 `sidebar.brand.mark`、`sidebar.brand.name` 与 `ctx.slots.inject()`。

组合包通过 `cordis.patch.yml` 将 `ui-brand-official` 行的模块替换为本插件，避免与官方品牌插件竞争。此方式保留侧栏外壳及交互；卸载本组合包后，配置重新组合，恢复官方品牌。插件未启用或更改尚未同步的页面可能需要刷新。

该配置要求现有官方品牌行存在，不适用于没有此行的自定义精简 profile。若安装报目标行不存在，应先核对 DSH 版本及 profile 的组合配置；不要盲目改成 DOM 注入。更晚加载的用户 patch 也可能覆盖本插件配置。

Logo 原图为 4140 × 640 PNG（白底）。使用 CSS 裁切同一张原图显示院徽与文字，不修改图片字节；深色主题保留原图白底。侧栏中图片高 24px，总宽约 155px。

目前完成了包结构、客户端加载协议、图片完整性与离线产物检查；未在医院实际 DSH 客户端中完成安装验收。应在目标客户端检查安装、启用、展开/折叠、深浅主题及卸载恢复。

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
