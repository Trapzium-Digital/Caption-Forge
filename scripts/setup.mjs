#!/usr/bin/env node
/**
 * CaptionForge setup (macOS, Windows, Linux).
 *
 *   node scripts/setup.mjs          check requirements, set up the local API, build the app
 *   node scripts/setup.mjs ai       install the optional AI runtime (WhisperX + translation, ~1.1 GB)
 *   node scripts/setup.mjs check    only check requirements
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { API_DIR, API_PYTHON, ROOT, bold, findPython, green, probe, red, run, yellow } from './lib.mjs'

const mode = process.argv[2] ?? 'core'

function check() {
  console.log(bold('\nChecking requirements'))
  const problems = []
  const node = process.versions.node.split('.').map(Number)
  if (node[0] >= 20) console.log(green('  ✓'), `Node.js ${process.versions.node}`)
  else problems.push(`Node.js 20 or newer is required (found ${process.versions.node}) - https://nodejs.org`)

  const python = findPython()
  if (python) console.log(green('  ✓'), `Python ${python.version}`)
  else problems.push('Python 3.9 or newer is required - https://www.python.org/downloads/')

  // CI packaging bundles its own FFmpeg, so the build machine does not need one.
  for (const tool of process.env.CAPTIONFORGE_SKIP_FFMPEG_CHECK ? [] : ['ffmpeg', 'ffprobe']) {
    const out = probe(tool, ['-version'])
    if (out) console.log(green('  ✓'), out.split(' ').slice(0, 3).join(' '))
    else problems.push(`${tool} is required - macOS: brew install ffmpeg · Windows: winget install Gyan.FFmpeg`)
  }
  if (problems.length) {
    console.log('')
    for (const p of problems) console.log(red('  ✗'), p)
    console.log(yellow('\nInstall the missing items, open a NEW terminal window, and run this again.'))
    process.exit(1)
  }
  return python
}

function setupApi(python) {
  console.log(bold('\nSetting up the local API'))
  if (!existsSync(API_PYTHON)) run(python.cmd, [...python.pre, '-m', 'venv', join(API_DIR, '.venv')])
  run(API_PYTHON, ['-m', 'pip', 'install', '-q', '--upgrade', 'pip'])
  run(API_PYTHON, ['-m', 'pip', 'install', '-q', '-r', join(API_DIR, 'requirements.txt')])
  console.log(green('  ✓'), 'Local API ready')
}

function installNodePackages() {
  console.log(bold('\nInstalling app packages'))
  if (!existsSync(join(ROOT, 'node_modules'))) run('npm', ['install'], { cwd: ROOT })
  console.log(green('  ✓'), 'Packages installed')
}

function buildWeb() {
  console.log(bold('\nBuilding the app'))
  run('npm', ['run', 'build'], { cwd: ROOT })
  console.log(green('  ✓'), 'App built')
}

function installAi() {
  if (!existsSync(API_PYTHON)) {
    console.log(red('Run the core setup first:'), 'node scripts/setup.mjs')
    process.exit(1)
  }
  run(API_PYTHON, ['-m', 'app.cli', 'install-ai'], { cwd: API_DIR })
}

try {
  if (mode === 'check') check()
  else if (mode === 'ai') installAi()
  else {
    const python = check()
    installNodePackages()
    setupApi(python)
    buildWeb()
    console.log(green(bold('\nCaptionForge is ready.')))
    console.log(`Start it with:  ${bold('npm start')}`)
    console.log('AI captions (optional): use the "Enable AI captions" button in the app, or run  npm run setup:ai\n')
  }
} catch (err) {
  console.error(red(`\nSetup failed: ${err.message}`))
  process.exit(1)
}
