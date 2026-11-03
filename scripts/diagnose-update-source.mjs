/** Standalone update-source diagnostic; zero dependencies, Node 18+ or DSH's Electron in Node mode.
 * 用法：ELECTRON_RUN_AS_NODE=1 "<DSH 安装目录>/DeepSeek Harness.exe" diagnose-update-source.mjs [插件安装目录]
 * 不传插件目录时按默认 profile 位置自动查找。只做只读检查，不修改任何文件。
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PACKAGE = 'dsh-plugin-hzhospital'
const REPO_URL = 'https://git.xrunda.com/mdt/dsh-plugin-hzhospital.git'
const RAW_BASE = 'https://git.xrunda.com/mdt/dsh-plugin-hzhospital/-/raw'
const candidates = process.argv[2]
  ? [process.argv[2]]
  : [join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', PACKAGE),
     join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), '.dsh', 'profiles', 'desktop', 'node_modules', PACKAGE)]
const dir = candidates.find(path => existsSync(join(path, 'package.json')))

console.log(`插件目录：${dir ?? '未找到（请把路径作为参数传入）'}`)
if (dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  console.log(`磁盘 package.json 版本：${manifest.version}；代码来源（DSH 记录的安装 spec）：${manifest._spec ?? '未记录'}`)
  const updater = readFileSync(join(dir, 'src', 'updater.js'), 'utf8')
  const hosts = [...updater.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map(match => match[1])
  console.log(`磁盘 updater.js 请求的域名：${[...new Set(hosts)].join(', ') || '未发现'}`)
  console.log(hosts.some(host => host.endsWith('github.com') || host.endsWith('githubusercontent.com'))
    ? '→ 磁盘代码仍是旧版（GitHub 源）：更新没有真正落盘，或 pnpm 从缓存装了旧内容。'
    : hosts.includes('git.xrunda.com')
      ? '→ 磁盘代码已是 GitLab 源（1.1.6+）。若界面仍报 GitHub 域名错误，说明运行中的 DSH 主进程尚未重新加载模块：请完全退出 DSH（含托盘/后台进程）后重开再试。'
      : '→ 磁盘代码域名异常，请把以上输出发给开发者。')
}

async function probe(label, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': PACKAGE } })
    const body = await response.text()
    console.log(`[${label}] ${url} → HTTP ${response.status}，响应 ${body.length} 字节`)
    return true
  } catch (error) {
    const cause = error?.cause ?? error
    console.log(`[${label}] ${url} → 失败：${error?.name === 'TimeoutError' ? '连接超时' : `name=${error?.name} code=${cause?.code ?? '无'} message=${error?.message}`}`)
    return false
  }
}

const refsOk = await probe('HTTP refs', `${REPO_URL}/info/refs?service=git-upload-pack`)
if (refsOk) {
  const refs = await (await fetch(`${REPO_URL}/info/refs?service=git-upload-pack`, { signal: AbortSignal.timeout(12000) })).text()
  const commit = /([a-f0-9]{40}) refs\/heads\/main/.exec(refs)?.[1]
  console.log(`main 提交：${commit ?? '未解析到'}`)
  if (commit) await probe('HTTP raw', `${RAW_BASE}/${commit}/package.json`)
}
const { execFile } = await import('node:child_process')
const { promisify } = await import('node:util')
const exec = promisify(execFile)
try {
  const { stdout } = await exec('git', ['ls-remote', '--', REPO_URL, 'refs/heads/main'], { timeout: 20000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  console.log(`[Git ls-remote] 成功：${stdout.trim().split('\n')[0]}`)
} catch (error) {
  console.log(`[Git ls-remote] 失败：${error?.killed ? '超时' : (error?.message ?? error).split('\n')[0]}`)
}
console.log('诊断结束。请把以上全部输出发给开发者。')
