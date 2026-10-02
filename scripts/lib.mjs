// Shared helpers for the setup / start scripts (macOS, Windows, Linux).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WINDOWS = platform() === 'win32'
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const API_DIR = join(ROOT, 'apps', 'local-api')
export const API_PYTHON = join(API_DIR, '.venv', WINDOWS ? 'Scripts/python.exe' : 'bin/python')
export const WEB_DIST = join(ROOT, 'apps', 'web', 'dist')

const color = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
export const green = color('32')
export const yellow = color('33')
export const red = color('31')
export const bold = color('1')

/** Run a command and wait. Throws with a readable message on failure. */
export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: WINDOWS && !cmd.endsWith('.exe'), ...opts })
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${result.status ?? result.error?.message})`)
}

/** First line of a command's output, or null if it is not available. */
export function probe(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: WINDOWS })
  if (result.status !== 0) return null
  return (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || ''
}

/** A Python >= 3.9 to build the API environment with. */
export function findPython() {
  const candidates = WINDOWS ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]]
  for (const [cmd, pre] of candidates) {
    const out = probe(cmd, [...pre, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'])
    if (!out) continue
    const [major, minor] = out.split('.').map(Number)
    if (major === 3 && minor >= 9) return { cmd, pre, version: out }
  }
  return null
}

export function spawnLogged(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: WINDOWS && !cmd.endsWith('.exe'), ...opts })
  const prefix = `[${name}] `
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n')
    })
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  return child
}

export function openBrowser(url) {
  const [cmd, args] = WINDOWS ? ['cmd', ['/c', 'start', '', url]] : platform() === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}

export async function waitFor(url, seconds = 60) {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

export const apiReady = () => existsSync(API_PYTHON)
