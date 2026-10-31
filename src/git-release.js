import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPOSITORY } from './updater.js'

const exec = promisify(execFile)
const SHA = /^[a-f0-9]{40}$/

/** Git fallback uses the installer's environment and Git's own proxy/configuration.
 * Fetch objects only: never checkout, execute package code or run Git hooks.
 */
export function gitReleaseReader({ cwd, env, signal, execute = exec }) {
  return async function readRelease() {
    const deadline = AbortSignal.timeout(35000)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    const directory = await mkdtemp(join(tmpdir(), 'hzh-version-'))
    const hooks = join(directory, 'empty-hooks')
    await mkdir(hooks)
    const git = async (args, workingDirectory) => {
      try {
        const { stdout } = await execute('git', ['-c', 'credential.helper=', '-c', `core.hooksPath=${hooks}`, ...args], {
          cwd: workingDirectory, env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', SSH_ASKPASS_REQUIRE: 'never', LC_ALL: 'C' },
          signal: combined, timeout: 20000, maxBuffer: 256 * 1024, windowsHide: true,
          encoding: 'utf8',
        })
        return stdout
      } catch (error) {
        // Git stderr can contain proxy credentials/URLs; expose categories only.
        const log = `${error.stderr ?? ''} ${error.message ?? ''}`
        if (signal?.aborted) throw new Error('插件已停用')
        if (combined.aborted || error.killed || /timed? out|ETIMEDOUT/i.test(log)) throw new Error('Git 安装源连接超时')
        if (error.code === 'ENOENT') throw new Error('找不到 Git；请检查安装插件时使用的 Git 环境')
        if (/could not resolve|ENOTFOUND|EAI_AGAIN/i.test(log)) throw new Error('Git 无法解析服务器地址（DNS）')
        if (/certificate|SSL peer|TLS/i.test(log)) throw new Error('Git HTTPS 证书或 TLS 校验失败')
        if (/407|proxy authentication/i.test(log)) throw new Error('Git 代理需要认证')
        if (/403|401|authentication failed|could not read Username/i.test(log)) throw new Error('Git 安装源拒绝访问或需要认证')
        throw new Error('Git 安装源连接失败；请检查安装时使用的网络和 Git 代理')
      }
    }
    try {
      const repository = `https://github.com/${REPOSITORY}.git`
      const refs = await git(['ls-remote', '--', repository, 'refs/heads/main'], cwd)
      const commit = /^([a-f0-9]{40})\s+refs\/heads\/main\s*$/m.exec(refs)?.[1]
      if (!commit || !SHA.test(commit)) throw new Error('Git 安装源未返回 main 分支提交')
      await git(['init', '--quiet', '--template=', directory], cwd)
      await git(['fetch', '--quiet', '--depth=1', '--no-tags', '--no-recurse-submodules', '--', repository, commit], directory)
      const manifest = JSON.parse(await git(['show', `${commit}:package.json`], directory))
      return { commit, manifest }
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  }
}
