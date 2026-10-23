#!/usr/bin/env node
/**
 * Smoke test for a packaged / installed CaptionForge app.
 *
 *   node scripts/smoke-app.mjs <app folder>
 *     macOS:   dist-app/CaptionForge.app/Contents/Resources
 *     Windows: the install folder (or dist-app/CaptionForge)
 *
 * Starts the bundled server exactly like the launchers do (bundled Python, Node and
 * FFmpeg only, in a scratch workspace), then imports a generated clip and renders an
 * MP4 with captions. Exits non-zero with the server log if any step fails.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { ROOT, WINDOWS } from './lib.mjs'

const R = process.argv[2] && resolve(process.argv[2])
if (!R) {
  console.error('Usage: node scripts/smoke-app.mjs <app folder>')
  process.exit(2)
}
const PORT = '8799'
const BASE = `http://127.0.0.1:${PORT}`
const exe = (name) => (WINDOWS ? `${name}.exe` : name)
const python = join(R, 'python', WINDOWS ? 'python.exe' : 'bin/python3')
const ffmpeg = join(R, 'ffmpeg', exe('ffmpeg'))
const home = mkdtempSync(join(tmpdir(), 'cf-smoke-'))
const systemPath = WINDOWS ? [join(process.env.SystemRoot, 'System32'), process.env.SystemRoot] : ['/usr/bin', '/bin', '/usr/sbin', '/sbin']

const env = {
  ...process.env,
  // Only the app's own tools, like the launchers - proves nothing is borrowed from this machine.
  PATH: [join(R, 'node', 'bin'), join(R, 'ffmpeg'), ...systemPath].join(delimiter),
  PYTHONPATH: join(R, 'api'),
  PYTHONDONTWRITEBYTECODE: '1',
  CAPTIONFORGE_HOME: home,
  CAPTIONFORGE_STATIC: join(R, 'web'),
  CAPTIONFORGE_RENDERER: join(R, 'rendering'),
  CAPTIONFORGE_AI_WORKERS: join(R, 'ai-worker'),
  CAPTIONFORGE_BUNDLED_PYTHON: python,
}

let log = ''
const server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', PORT], { cwd: join(R, 'api'), env })
server.stdout.on('data', (d) => (log += d))
server.stderr.on('data', (d) => (log += d))
server.on('error', (err) => (log += `Could not start ${python}: ${err.message}\n`))

const step = (s) => console.log(`▸ ${s}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let token = ''
async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { 'x-captionforge-token': token, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function main() {
  step('Starting the bundled server')
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || server.pid === undefined) throw new Error(`Server exited (code ${server.exitCode})`)
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break
    } catch {
      /* not up yet */
    }
    if (i > 120) throw new Error('Server did not start within 60 s')
    await sleep(500)
  }
  token = readFileSync(join(home, 'api-token'), 'utf8').trim()
  const page = await fetch(`${BASE}/`)
  if (!page.ok || !(await page.text()).includes('<div id="root">')) throw new Error('The app page is not served')

  step('Importing a generated clip (bundled FFmpeg)')
  const clip = join(home, 'clip.mp4')
  const gen = spawnSync(
    ffmpeg,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip],
    { encoding: 'utf8' },
  )
  if (gen.status !== 0) throw new Error(`Bundled FFmpeg failed: ${gen.stderr || gen.error?.message}`)
  const doc = JSON.parse(readFileSync(join(ROOT, 'apps', 'local-api', 'tests', 'fixtures', 'project.json'), 'utf8'))
  await api('/api/projects', json('POST', { document: doc }))
  const asset = await api(`/api/media/import?filename=clip.mp4&projectId=${doc.id}`, { method: 'POST', body: readFileSync(clip) })
  doc.primaryVideoId = asset.id
  await api(`/api/projects/${doc.id}`, json('PUT', { document: doc }))

  for (const quality of ['standard', 'high']) {
    step(`Rendering an MP4 with captions (${quality})`)
    const job = await api('/api/renders', json('POST', { projectId: doc.id, payload: { format: 'mp4', quality } }))
    let current = job
    for (let i = 0; current.status === 'queued' || current.status === 'running'; i++) {
      if (i > 600) throw new Error('Render did not finish within 10 minutes')
      await sleep(1000)
      current = await api(`/api/jobs/${job.id}`)
    }
    if (current.status !== 'complete') throw new Error(`Render ${current.status}: ${current.error}`)
    const r = current.result
    if (!r.verified || r.width !== 320 || r.height !== 240) throw new Error(`Unexpected render result: ${JSON.stringify(r)}`)
    console.log(`  ✓ ${r.width}×${r.height}, ${(r.durationMs / 1000).toFixed(2)} s, ${r.sizeBytes} bytes`)
  }
}

let failed = false
try {
  await main()
  console.log('\n✓ Smoke test passed')
} catch (err) {
  failed = true
  console.error(`\n✗ Smoke test failed: ${err.message}\n\n--- server log ---\n${log.slice(-6000)}`)
} finally {
  server.kill()
  await sleep(1000)
  rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}
process.exit(failed ? 1 : 0)
