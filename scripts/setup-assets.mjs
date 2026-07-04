/**
 * Copies the MediaPipe Tasks-Vision WASM runtime out of node_modules and
 * downloads the pose-landmarker model into public/, so the app serves them
 * itself with no runtime CDN dependency (works offline once set up).
 *
 * Runs automatically on `npm install` (postinstall) and via `npm run setup`.
 * Failures are non-fatal so an offline install still succeeds — you can rerun
 * `npm run setup` later.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const WASM_SRC = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const WASM_DEST = join(root, 'public/mediapipe/wasm')

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
const MODEL_DEST = join(root, 'public/models/pose_landmarker_full.task')

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    console.warn('[setup] WASM source not found — run `npm install` first.')
    return
  }
  await mkdir(WASM_DEST, { recursive: true })
  await cp(WASM_SRC, WASM_DEST, { recursive: true })
  console.log('[setup] Copied MediaPipe WASM runtime -> public/mediapipe/wasm')
}

async function downloadModel() {
  if (await exists(MODEL_DEST)) {
    console.log('[setup] Model already present -> skipping download')
    return
  }
  await mkdir(dirname(MODEL_DEST), { recursive: true })
  console.log('[setup] Downloading pose model (~9 MB)…')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching model`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(MODEL_DEST, buf)
  console.log(`[setup] Saved model (${(buf.length / 1e6).toFixed(1)} MB)`)
}

try {
  await copyWasm()
  await downloadModel()
  console.log('[setup] Done.')
} catch (err) {
  console.warn(
    `[setup] Asset setup incomplete: ${err.message}\n` +
      '        Rerun `npm run setup` once you have network access.',
  )
}
