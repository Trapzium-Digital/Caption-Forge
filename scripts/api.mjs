#!/usr/bin/env node
// Cross-platform wrapper: `npm run dev:api` (uvicorn with reload) and `npm run test:api` (pytest).
import { API_DIR, API_PYTHON, run } from './lib.mjs'

const args =
  process.argv[2] === 'test'
    ? ['-m', 'pytest', '-q', ...process.argv.slice(3)]
    : ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', process.env.CAPTIONFORGE_API_PORT ?? '8756', '--reload']
try {
  run(API_PYTHON, args, { cwd: API_DIR })
} catch {
  process.exit(1)
}
