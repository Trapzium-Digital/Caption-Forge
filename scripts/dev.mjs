#!/usr/bin/env node
// Starts the local API and the web UI together, then opens the browser.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(root, 'apps', 'local-api')
const python = join(apiDir, '.venv', platform() === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const API_PORT = process.env.CAPTIONFORGE_API_PORT ?? '8756'
const WEB_URL = 'http://127.0.0.1:5173'

if (!existsSync(python)) {
  console.error('Local API is not set up yet. Run:  npm run setup')
  process.exit(1)
}

const children = []
function run(name, cmd, args, cwd, color) {
  // npm is a .cmd script on Windows and needs a shell there.
  const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: platform() === 'win32' && cmd === 'npm' })
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split('\n')) if (line.trim()) out.write(prefix + line + '\n')
    })
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    console.log(`${prefix}exited (${code ?? 'signal'})`)
    shutdown(code ?? 0)
  })
  children.push(child)
}

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM')
  setTimeout(() => process.exit(code), 500)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('api', python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', API_PORT, '--reload'], apiDir, '36')
run('web', 'npm', ['run', 'dev', '-w', '@captionforge/web'], root, '33')

async function openWhenReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${WEB_URL}/api/health`)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log(`\n  CaptionForge is running at ${WEB_URL}\n`)
  if (process.env.CAPTIONFORGE_NO_OPEN) return
  const opener = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open'
  spawn(opener, [WEB_URL], { stdio: 'ignore', detached: true, shell: platform() === 'win32' }).unref()
}
void openWhenReady()
