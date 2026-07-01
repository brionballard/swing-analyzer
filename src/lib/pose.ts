import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { AnalyzeOptions, FrameData } from '../types'

// Served from public/ (populated by `npm run setup`), so there is no runtime
// CDN dependency and analysis works fully offline.
const WASM_URL = `${import.meta.env.BASE_URL}mediapipe/wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`

let landmarkerPromise: Promise<PoseLandmarker> | null = null

/** Lazily create (and cache) a video-mode pose landmarker. */
export function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    })().catch((err) => {
      // allow a retry on a later call
      landmarkerPromise = null
      throw err
    })
  }
  return landmarkerPromise
}

/** Seek a video element to `time` (seconds) and resolve once the frame is ready. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    // Clamp just inside the duration to avoid a hang at the very end.
    video.currentTime = Math.min(time, Math.max(0, video.duration - 1e-3))
  })
}

/**
 * Step through the whole video at `opts.fps`, running pose detection on each
 * sampled frame. Returns landmarks for every frame (null where no pose found).
 *
 * This is deliberately seek-based rather than real-time playback so that every
 * frame is analyzed deterministically regardless of decode speed.
 */
export async function analyzeVideo(
  video: HTMLVideoElement,
  opts: AnalyzeOptions,
): Promise<FrameData[]> {
  const landmarker = await getLandmarker()
  const duration = video.duration
  if (!isFinite(duration) || duration <= 0) {
    throw new Error('Video has no readable duration.')
  }

  const wasPaused = video.paused
  video.pause()

  const step = 1 / opts.fps
  const frames: FrameData[] = []
  let index = 0
  let lastTsMs = -1

  for (let t = 0; t < duration; t += step) {
    await seekTo(video, t)

    // detectForVideo requires strictly increasing timestamps.
    let tsMs = Math.round(video.currentTime * 1000)
    if (tsMs <= lastTsMs) tsMs = lastTsMs + 1
    lastTsMs = tsMs

    let result: PoseLandmarkerResult | undefined
    try {
      result = landmarker.detectForVideo(video, tsMs)
    } catch {
      result = undefined
    }

    frames.push({
      time: video.currentTime,
      index,
      landmarks: result?.landmarks?.[0] ?? null,
      worldLandmarks: result?.worldLandmarks?.[0] ?? null,
    })

    index++
    opts.onProgress?.(Math.min(1, t / duration))
  }

  opts.onProgress?.(1)
  if (!wasPaused) void video.play()
  return frames
}
