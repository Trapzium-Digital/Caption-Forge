#!/usr/bin/env node
/**
 * CaptionForge production renderer (Remotion).
 *
 *   node render.mjs <job.json>
 *
 * job.json: { project, videoPath|null, output, format: "mp4"|"webm-alpha", durationMs, cacheDir }
 * Progress is written to stdout as JSON lines: {"stage": "...", "progress": 0..1}
 */
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureBrowser, renderFrames, renderMedia, selectComposition } from '@remotion/renderer'

const here = dirname(fileURLToPath(import.meta.url))
const emit = (data) => process.stdout.write(JSON.stringify(data) + '\n')

/** Serve one local file over HTTP (with Range support) so the headless browser can stream it. */
function serveFile(path) {
  return new Promise((resolve) => {
    const size = statSync(path).size
    const server = createServer((req, res) => {
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
      if (range) {
        const start = range[1] ? Number(range[1]) : 0
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': 'application/octet-stream',
        })
        createReadStream(path, { start, end }).pipe(res)
      } else {
        res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' })
        createReadStream(path).pipe(res)
      }
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/media` }))
  })
}

async function main() {
  const job = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  // Captions-only renders on a transparent background:
  //   webm-alpha - VP9 WebM (web, CapCut, browsers)
  //   mov-alpha  - Apple ProRes 4444 .mov (Premiere Pro, Final Cut, DaVinci Resolve, After Effects)
  //   mov-png    - QuickTime PNG .mov: lossless, ~3x smaller than ProRes, slightly heavier to play back
  const transparent = job.format === 'webm-alpha' || job.format === 'mov-alpha' || job.format === 'mov-png'
  const output =
    job.format === 'mov-alpha'
      ? { codec: 'prores', proResProfile: '4444', imageFormat: 'png', pixelFormat: 'yuva444p10le' }
      : job.format === 'webm-alpha'
        ? { codec: 'vp9', imageFormat: 'png', pixelFormat: 'yuva420p' }
        : job.quality === 'high'
          ? // Lossless frames (no JPEG step), BT.709 like camera/phone footage, and a finer encode.
            { codec: 'h264', crf: 15, x264Preset: 'slow', pixelFormat: 'yuv420p', imageFormat: 'png', colorSpace: 'bt709' }
          : { codec: 'h264', crf: 18, pixelFormat: 'yuv420p' }

  emit({ stage: 'preparing', progress: 0 })
  await ensureBrowser({ onBrowserDownload: () => ({ onProgress: ({ percent }) => emit({ stage: 'preparing', progress: percent * 0.5 }) }) })

  emit({ stage: 'bundling', progress: 0 })
  // The installed app ships a pre-built composition (bundle/); development builds it on demand.
  const prebuilt = process.env.CAPTIONFORGE_REMOTION_BUNDLE || join(here, 'bundle')
  let serveUrl
  if (existsSync(join(prebuilt, 'index.html'))) {
    serveUrl = prebuilt
    emit({ stage: 'bundling', progress: 1 })
  } else {
    const { bundle } = await import('@remotion/bundler')
    serveUrl = await bundle({
      entryPoint: join(here, 'src', 'index.ts'),
      outDir: job.cacheDir ? join(job.cacheDir, 'remotion-bundle') : undefined,
      onProgress: (p) => emit({ stage: 'bundling', progress: p / 100 }),
    })
  }

  let media = null
  if (job.videoPath && !transparent) media = await serveFile(job.videoPath)

  try {
    const inputProps = { project: job.project, videoUrl: media?.url ?? null, transparent, durationMs: job.durationMs, speech: job.speech ?? null }
    const composition = await selectComposition({ serveUrl, id: 'CaptionForge', inputProps })
    emit({ stage: 'rendering', progress: 0 })
    if (job.format === 'mov-png') {
      await renderPngMov({ composition, serveUrl, inputProps, output: job.output, cacheDir: job.cacheDir })
      emit({ stage: 'done', progress: 1, output: job.output })
      return
    }
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      outputLocation: job.output,
      ...output,
      muted: transparent,
      onProgress: ({ progress, stitchStage }) =>
        emit({ stage: stitchStage === 'muxing' || progress > 0.98 ? 'encoding' : 'rendering', progress }),
    })
  } finally {
    media?.server.close()
  }
  emit({ stage: 'done', progress: 1, output: job.output })
}

/** Run FFmpeg with an argument list (never a shell string). */
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim().split('\n').pop()}`))))
  })
}

/**
 * QuickTime PNG: Remotion renders lossless PNG frames with the same composition,
 * then FFmpeg packs them into a .mov without re-compressing (PNG in, PNG out).
 */
async function renderPngMov({ composition, serveUrl, inputProps, output, cacheDir }) {
  const frameDir = mkdtempSync(join(cacheDir || tmpdir(), 'png-frames-'))
  try {
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      outputDir: frameDir,
      imageFormat: 'png',
      onStart: () => undefined,
      onFrameUpdate: (rendered) => emit({ stage: 'rendering', progress: rendered / composition.durationInFrames }),
    })
    const frames = readdirSync(frameDir).filter((f) => /^element-\d+\.png$/.test(f)).sort()
    if (frames.length === 0) throw new Error('No frames were rendered')
    // Frames are element-<zero-padded frame>.png. Use a numbered pattern (glob input is not
    // available in Windows FFmpeg builds).
    const digits = frames[0].match(/^element-(\d+)\.png$/)[1]
    emit({ stage: 'encoding', progress: 0 })
    await ffmpeg([
      '-v', 'error', '-y',
      '-framerate', String(composition.fps),
      '-start_number', String(Number(digits)),
      '-i', join(frameDir, `element-%0${digits.length}d.png`),
      '-c:v', 'png',
      '-pix_fmt', 'rgba',
      output,
    ])
    emit({ stage: 'encoding', progress: 1 })
  } finally {
    rmSync(frameDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  emit({ stage: 'error', error: String(err?.stack ?? err) })
  process.exit(1)
})
