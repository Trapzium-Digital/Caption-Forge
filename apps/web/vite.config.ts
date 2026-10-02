import { readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_PORT = Number(process.env.CAPTIONFORGE_API_PORT ?? 8756)

function captionForgeHome(): string {
  if (process.env.CAPTIONFORGE_HOME) return process.env.CAPTIONFORGE_HOME
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'CaptionForge')
  if (platform() === 'win32') return join(process.env.APPDATA ?? homedir(), 'CaptionForge')
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'CaptionForge')
}

/** Read the local API token on every request (the API may create it after Vite starts). */
function readToken(): string {
  try {
    return readFileSync(join(captionForgeHome(), 'api-token'), 'utf8').trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1500 },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => req.setHeader('x-captionforge-token', readToken()))
        },
      },
    },
  },
})
