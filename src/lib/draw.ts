import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { LM, SKELETON_CONNECTIONS } from './landmarks'
import { visible, type Vec2 } from './geometry'

export interface DrawOptions {
  showSkeleton: boolean
  showTracer: boolean
  showClubEstimate: boolean
  /** 0..1 normalized tracer points, oldest first, up to the current frame. */
  tracer: (Vec2 | null)[]
  /** Current landmarks for the displayed frame (normalized). */
  landmarks: NormalizedLandmark[] | null
  /** Handedness controls which wrist anchors the club estimate. */
  leadWrist: number
  leadElbow: number
}

const SKELETON_COLOR = '#3ddc97'
const JOINT_COLOR = '#ffffff'
const CLUB_COLOR = '#ffd166'

/** Clear and resize the overlay canvas to match the displayed video box. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): { w: number; h: number } {
  const rect = video.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { w, h }
}

function px(pt: Vec2, w: number, h: number): Vec2 {
  return { x: pt.x * w, y: pt.y * h }
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
) {
  ctx.lineWidth = 3
  ctx.strokeStyle = SKELETON_COLOR
  ctx.lineCap = 'round'

  for (const [a, b] of SKELETON_CONNECTIONS) {
    const la = landmarks[a]
    const lb = landmarks[b]
    if (!visible(la) || !visible(lb)) continue
    const pa = px(la, w, h)
    const pb = px(lb, w, h)
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  // Joints
  ctx.fillStyle = JOINT_COLOR
  const joints = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
    LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.NOSE,
  ]
  for (const j of joints) {
    const lm = landmarks[j]
    if (!visible(lm)) continue
    const pt = px(lm, w, h)
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Draw the swing tracer as a fading gradient trail. */
export function drawTracer(
  ctx: CanvasRenderingContext2D,
  tracer: (Vec2 | null)[],
  w: number,
  h: number,
) {
  const pts = tracer
    .map((pt) => (pt ? px(pt, w, h) : null))
    .filter((pt): pt is Vec2 => pt !== null)
  if (pts.length < 2) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 1; i < pts.length; i++) {
    const t = i / (pts.length - 1)
    // Hue sweeps cyan -> magenta along the path; newer = brighter/thicker.
    const hue = 190 + t * 140
    ctx.strokeStyle = `hsla(${hue}, 95%, 60%, ${0.25 + 0.75 * t})`
    ctx.lineWidth = 2 + 4 * t
    ctx.beginPath()
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
    ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }

  // Leading dot at the current position.
  const head = pts[pts.length - 1]
  ctx.fillStyle = '#ff5edb'
  ctx.beginPath()
  ctx.arc(head.x, head.y, 5, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw an estimated club shaft by extending the forearm (elbow -> wrist)
 * direction beyond the hands. This is an approximation — a true clubhead
 * tracer needs object detection — but it reads well for the swing arc.
 */
export function drawClubEstimate(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  leadWrist: number,
  leadElbow: number,
  w: number,
  h: number,
) {
  const wrist = landmarks[leadWrist]
  const elbow = landmarks[leadElbow]
  if (!visible(wrist) || !visible(elbow)) return

  const pw = px(wrist, w, h)
  const pe = px(elbow, w, h)
  const dx = pw.x - pe.x
  const dy = pw.y - pe.y
  const forearm = Math.hypot(dx, dy) || 1
  // Club shaft is roughly ~1.7x the forearm length from the hands.
  const shaft = forearm * 1.7
  const head = {
    x: pw.x + (dx / forearm) * shaft,
    y: pw.y + (dy / forearm) * shaft,
  }

  ctx.strokeStyle = CLUB_COLOR
  ctx.lineWidth = 3
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(pw.x, pw.y)
  ctx.lineTo(head.x, head.y)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = CLUB_COLOR
  ctx.beginPath()
  ctx.arc(head.x, head.y, 5, 0, Math.PI * 2)
  ctx.fill()
}

/** Render one full overlay frame. */
export function renderOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  opts: DrawOptions,
) {
  const { w, h } = fitCanvas(canvas, video)
  const ctx = canvas.getContext('2d')!

  if (opts.showTracer) drawTracer(ctx, opts.tracer, w, h)
  if (opts.landmarks) {
    if (opts.showSkeleton) drawSkeleton(ctx, opts.landmarks, w, h)
    if (opts.showClubEstimate) {
      drawClubEstimate(ctx, opts.landmarks, opts.leadWrist, opts.leadElbow, w, h)
    }
  }
}
