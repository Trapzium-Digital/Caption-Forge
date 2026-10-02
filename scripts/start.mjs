#!/usr/bin/env node
/**
 * Start CaptionForge for everyday use: one local server that serves the app
 * and the API, then opens the browser. (Developers use `npm run dev`.)
 *
 *   npm start                 start on http://127.0.0.1:8756
 *   npm start -- --no-open    do not open the browser
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { API_DIR, API_PYTHON, WEB_DIST, bold, green, openBrowser, red, spawnLogged, waitFor } from './lib.mjs'

const PORT = process.env.CAPTIONFORGE_PORT ?? '8756'
const URL = `http://127.0.0.1:${PORT}`

if (!existsSync(API_PYTHON) || !existsSync(join(WEB_DIST, 'index.html'))) {
  console.error(red('CaptionForge is not set up yet. Run:'), bold('npm run setup'))
  process.exit(1)
}

const server = spawnLogged('captionforge', API_PYTHON, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', PORT], {
  cwd: API_DIR,
  env: { ...process.env, CAPTIONFORGE_STATIC: WEB_DIST },
})
server.on('exit', (code) => process.exit(code ?? 0))
const stop = () => server.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

if (await waitFor(`${URL}/api/health`)) {
  console.log(green(bold(`\n  CaptionForge is running at ${URL}`)))
  console.log('  Keep this window open while you use it. Press Ctrl+C to stop.\n')
  if (!process.argv.includes('--no-open')) openBrowser(URL)
} else {
  console.error(red('CaptionForge did not start - see the messages above.'))
  stop()
}
