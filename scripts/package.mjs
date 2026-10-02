#!/usr/bin/env node
/**
 * Build the installable CaptionForge app.
 *
 *   macOS:   node scripts/package.mjs   ->  dist-app/CaptionForge-<version>-mac-<arch>.dmg
 *   Windows: node scripts/package.mjs   ->  dist-app/CaptionForge-<version>-windows-x64.zip
 *            (+ an Inno Setup installer when ISCC is available, e.g. in GitHub Actions)
 *
 * The app bundles everything except the optional AI runtime:
 *   python/      private Python 3.12 + the local server (FastAPI)
 *   node/        Node.js runtime for rendering
 *   ffmpeg/      static FFmpeg + FFprobe
 *   rendering/   Remotion renderer, pre-built composition and headless Chrome
 *   web/ api/ ai-worker/   the app itself
 * AI captions are downloaded later from inside the app ("Enable AI captions").
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { API_DIR, API_PYTHON, ROOT, WEB_DIST, WINDOWS, bold, green, run } from './lib.mjs'

const MAC = platform() === 'darwin'
const ARCH = arch() === 'arm64' ? 'arm64' : 'x64'
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const NODE_VERSION = 'v24.21.0'
const FFMPEG_MAC_RELEASE = '1789931890_9.0.2'
const OUT = join(ROOT, 'dist-app')
const CACHE = join(OUT, 'cache')
const APP = MAC ? join(OUT, 'CaptionForge.app') : join(OUT, 'CaptionForge')
const RES = MAC ? join(APP, 'Contents', 'Resources') : APP
const RENDER_PKG = JSON.parse(readFileSync(join(ROOT, 'packages', 'rendering', 'package.json'), 'utf8'))

const step = (s) => console.log(bold(`\n▸ ${s}`))
const du = (path) => {
  let total = 0
  const walk = (p) => {
    const st = statSync(p)
    if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f))
    else total += st.size
  }
  walk(path)
  return total
}
const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`

async function download(url, dest) {
  if (existsSync(dest)) return dest
  console.log(`  downloading ${url}`)
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await pipeline(res.body, createWriteStream(`${dest}.part`))
      renameSync(`${dest}.part`, dest)
      return dest
    } catch (err) {
      if (attempt === 4) throw new Error(`Download failed: ${url} (${err.message})`)
      console.log(`  retrying (${err.message})`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
}

function unzip(file, dest) {
  mkdirSync(dest, { recursive: true })
  if (WINDOWS) run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${file}' '${dest}'`])
  else run('unzip', ['-q', '-o', file, '-d', dest])
}

function uv() {
  const bin = join(API_DIR, '.venv', WINDOWS ? 'Scripts/uv.exe' : 'bin/uv')
  if (!existsSync(bin)) run(API_PYTHON, ['-m', 'pip', 'install', '-q', 'uv'])
  return bin
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(bold(`CaptionForge ${VERSION} - packaging for ${MAC ? 'macOS' : 'Windows'} ${ARCH}`))
  if (!existsSync(API_PYTHON)) throw new Error('Run "npm run setup" first')
  rmSync(APP, { recursive: true, force: true })
  mkdirSync(RES, { recursive: true })
  mkdirSync(CACHE, { recursive: true })

  step('Building the web app')
  run('npm', ['run', 'build'], { cwd: ROOT })
  cpSync(WEB_DIST, join(RES, 'web'), { recursive: true })

  step('Private Python 3.12 + local server')
  const pyCache = join(CACHE, 'python')
  run(uv(), ['python', 'install', '3.12'], { env: { ...process.env, UV_PYTHON_INSTALL_DIR: pyCache } })
  // uv keeps the real install in cpython-3.12.<patch>-... (cpython-3.12-... is a symlink to it)
  const pyDir = readdirSync(pyCache).find((d) => /^cpython-3\.12\.\d+/.test(d) && lstatSync(join(pyCache, d)).isDirectory())
  if (!pyDir) throw new Error('Python 3.12 not found after install')
  cpSync(join(pyCache, pyDir), join(RES, 'python'), { recursive: true, verbatimSymlinks: true })
  const python = join(RES, 'python', WINDOWS ? 'python.exe' : 'bin/python3')
  const requirements = readFileSync(join(API_DIR, 'requirements.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^(pytest|httpx)\b/.test(l))
  run(uv(), ['pip', 'install', '--python', python, '--break-system-packages', '-q', ...requirements, 'uv'])
  cpSync(join(API_DIR, 'app'), join(RES, 'api', 'app'), { recursive: true, filter: (src) => !src.includes('__pycache__') })
  cpSync(join(ROOT, 'apps', 'ai-worker'), join(RES, 'ai-worker'), { recursive: true, filter: (src) => !src.includes('__pycache__') })

  step('Node.js runtime')
  const nodeName = MAC ? `node-${NODE_VERSION}-darwin-${ARCH}` : `node-${NODE_VERSION}-win-x64`
  const nodeArchive = await download(`https://nodejs.org/dist/${NODE_VERSION}/${nodeName}.${MAC ? 'tar.gz' : 'zip'}`, join(CACHE, `${nodeName}.${MAC ? 'tar.gz' : 'zip'}`))
  const nodeExtract = join(CACHE, nodeName)
  if (!existsSync(nodeExtract)) {
    if (MAC) run('tar', ['-xzf', nodeArchive, '-C', CACHE])
    else unzip(nodeArchive, CACHE)
  }
  mkdirSync(join(RES, 'node', 'bin'), { recursive: true })
  if (MAC) copyFileSync(join(nodeExtract, 'bin', 'node'), join(RES, 'node', 'bin', 'node'))
  else copyFileSync(join(nodeExtract, 'node.exe'), join(RES, 'node', 'bin', 'node.exe'))
  if (MAC) chmodSync(join(RES, 'node', 'bin', 'node'), 0o755)

  step('FFmpeg (static)')
  mkdirSync(join(RES, 'ffmpeg'), { recursive: true })
  if (MAC) {
    for (const tool of ['ffmpeg', 'ffprobe']) {
      const zip = await download(`https://ffmpeg.martin-riedl.de/download/macos/${ARCH}/${FFMPEG_MAC_RELEASE}/${tool}.zip`, join(CACHE, `${tool}-${ARCH}.zip`))
      unzip(zip, join(RES, 'ffmpeg'))
      chmodSync(join(RES, 'ffmpeg', tool), 0o755)
    }
  } else {
    const zip = await download('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', join(CACHE, 'ffmpeg-win.zip'))
    const tmp = join(CACHE, 'ffmpeg-win')
    if (!existsSync(tmp)) unzip(zip, tmp)
    const bin = join(tmp, readdirSync(tmp)[0], 'bin')
    for (const tool of ['ffmpeg.exe', 'ffprobe.exe']) copyFileSync(join(bin, tool), join(RES, 'ffmpeg', tool))
  }

  step('Renderer (Remotion) with pre-built composition')
  const rendering = join(RES, 'rendering')
  mkdirSync(rendering, { recursive: true })
  writeFileSync(
    join(rendering, 'package.json'),
    JSON.stringify(
      {
        name: 'captionforge-renderer',
        private: true,
        type: 'module',
        dependencies: { remotion: RENDER_PKG.dependencies.remotion, '@remotion/renderer': RENDER_PKG.dependencies['@remotion/renderer'] },
      },
      null,
      2,
    ),
  )
  copyFileSync(join(ROOT, 'packages', 'rendering', 'render.mjs'), join(rendering, 'render.mjs'))
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: rendering })
  // Pre-build the composition so the app needs no bundler at runtime.
  const bundleScript = join(ROOT, 'packages', 'rendering', '.bundle.tmp.mjs')
  writeFileSync(
    bundleScript,
    `import { bundle } from '@remotion/bundler'\nawait bundle({ entryPoint: ${JSON.stringify(join(ROOT, 'packages', 'rendering', 'src', 'index.ts'))}, outDir: ${JSON.stringify(join(rendering, 'bundle'))} })\n`,
  )
  try {
    run('node', [bundleScript], { cwd: join(ROOT, 'packages', 'rendering') })
  } finally {
    rmSync(bundleScript, { force: true })
  }
  // Headless Chrome for rendering: reuse this machine's copy when it matches, else download.
  const localChrome = join(ROOT, 'packages', 'rendering', 'node_modules', '.remotion')
  if (existsSync(localChrome)) cpSync(localChrome, join(rendering, 'node_modules', '.remotion'), { recursive: true, verbatimSymlinks: true })
  else run('node', ['-e', "import('@remotion/renderer').then((m) => m.ensureBrowser())"], { cwd: rendering })

  step('Launcher')
  if (MAC) writeMacLauncher()
  else writeWindowsLauncher()

  step('Package')
  const size = du(APP)
  console.log(`  app size: ${mb(size)}`)
  if (MAC) await packageMac()
  else packageWindows()
}

// ---------------------------------------------------------------------------

function writeMacLauncher() {
  const contents = join(APP, 'Contents')
  mkdirSync(join(contents, 'MacOS'), { recursive: true })
  writeFileSync(
    join(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>CaptionForge</string>
  <key>CFBundleDisplayName</key><string>CaptionForge</string>
  <key>CFBundleIdentifier</key><string>digital.trapzium.captionforge</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>CaptionForge</string>
  <key>CFBundleIconFile</key><string>CaptionForge</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
  )
  const launcher = join(contents, 'MacOS', 'CaptionForge')
  writeFileSync(launcher, readFileSync(join(ROOT, 'scripts', 'app', 'launcher-mac.sh'), 'utf8'))
  chmodSync(launcher, 0o755)
  const icon = join(ROOT, 'scripts', 'app', 'CaptionForge.icns')
  if (existsSync(icon)) copyFileSync(icon, join(RES, 'CaptionForge.icns'))
}

function writeWindowsLauncher() {
  for (const f of ['launcher-windows.ps1', 'CaptionForge.vbs']) copyFileSync(join(ROOT, 'scripts', 'app', f), join(APP, f))
  const icon = join(ROOT, 'scripts', 'app', 'CaptionForge.ico')
  if (existsSync(icon)) copyFileSync(icon, join(APP, 'CaptionForge.ico'))
}

async function packageMac() {
  // Ad-hoc signature so Apple Silicon runs the bundled binaries; a Developer ID signature
  // and notarisation are needed to remove the "unidentified developer" prompt.
  spawnSync('codesign', ['--force', '--deep', '--sign', '-', APP], { stdio: 'inherit' })
  const stage = join(OUT, 'dmg')
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  run('ditto', [APP, join(stage, 'CaptionForge.app')])
  execFileSync('ln', ['-s', '/Applications', join(stage, 'Applications')])
  const dmg = join(OUT, `CaptionForge-${VERSION}-mac-${ARCH}.dmg`)
  rmSync(dmg, { force: true })
  run('hdiutil', ['create', '-volname', 'CaptionForge', '-srcfolder', stage, '-ov', '-format', 'ULMO', dmg])
  rmSync(stage, { recursive: true, force: true })
  console.log(green(bold(`\n✓ ${basename(dmg)}  (${mb(statSync(dmg).size)} download, ${mb(du(APP))} installed)`)))
}

function packageWindows() {
  const zip = join(OUT, `CaptionForge-${VERSION}-windows-x64.zip`)
  rmSync(zip, { force: true })
  run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${APP}' -DestinationPath '${zip}' -CompressionLevel Optimal`])
  console.log(green(bold(`\n✓ ${basename(zip)}  (${mb(statSync(zip).size)})`)))
  const iscc = ['C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe', 'C:\\Program Files\\Inno Setup 6\\ISCC.exe'].find(existsSync)
  if (iscc) {
    run(iscc, [`/DAppVersion=${VERSION}`, `/DSourceDir=${APP}`, `/DOutputDir=${OUT}`, join(ROOT, 'scripts', 'app', 'installer-windows.iss')])
    console.log(green(bold(`✓ CaptionForge-${VERSION}-windows-x64-setup.exe`)))
  } else {
    console.log('  (Inno Setup not found - skipped the .exe installer; the .zip works on its own)')
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`)
  process.exit(1)
})
