import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { LM } from './landmarks'
import {
  angleFromHorizontal,
  angleFromVertical,
  dist,
  jointAngle,
  mid,
  sub,
  visible,
  type Vec2,
} from './geometry'
import type {
  AnalysisResult,
  FrameData,
  FrameMetrics,
  Handedness,
  SwingEvents,
  ViewType,
} from '../types'

const p = (lm: NormalizedLandmark): Vec2 => ({ x: lm.x, y: lm.y })

/** Which landmark indices are the "lead" (target-side) arm/leg for a golfer. */
function leadSide(handedness: Handedness) {
  // Right-handed golfer leads with the LEFT side; left-handed with the RIGHT.
  return handedness === 'right'
    ? {
        shoulder: LM.LEFT_SHOULDER,
        elbow: LM.LEFT_ELBOW,
        wrist: LM.LEFT_WRIST,
        hip: LM.LEFT_HIP,
        knee: LM.LEFT_KNEE,
        ankle: LM.LEFT_ANKLE,
      }
    : {
        shoulder: LM.RIGHT_SHOULDER,
        elbow: LM.RIGHT_ELBOW,
        wrist: LM.RIGHT_WRIST,
        hip: LM.RIGHT_HIP,
        knee: LM.RIGHT_KNEE,
        ankle: LM.RIGHT_ANKLE,
      }
}

function trailSide(handedness: Handedness) {
  return leadSide(handedness === 'right' ? 'left' : 'right')
}

/** Rotation about the vertical axis (degrees) of a world-space left->right line. */
function worldTurn(
  world: NormalizedLandmark[] | null,
  leftIdx: number,
  rightIdx: number,
): number | undefined {
  if (!world) return undefined
  const l = world[leftIdx]
  const r = world[rightIdx]
  if (!l || !r) return undefined
  // Project the left->right vector onto the horizontal (x,z) plane and take its
  // heading. As the golfer turns, this heading sweeps through ~180 degrees.
  return (Math.atan2(r.z - l.z, r.x - l.x) * 180) / Math.PI
}

/** Compute raw (un-baselined) per-frame metrics. */
function rawMetrics(
  frame: FrameData,
  handedness: Handedness,
): {
  metrics: FrameMetrics
  nose?: Vec2
  torso?: number
  hands?: Vec2
  hipTurnRaw?: number
  shoulderTurnRaw?: number
} {
  const m: FrameMetrics = { time: frame.time, index: frame.index }
  const l = frame.landmarks
  if (!l) return { metrics: m }

  const lead = leadSide(handedness)
  const trail = trailSide(handedness)

  const lShoulder = l[LM.LEFT_SHOULDER]
  const rShoulder = l[LM.RIGHT_SHOULDER]
  const lHip = l[LM.LEFT_HIP]
  const rHip = l[LM.RIGHT_HIP]

  const haveTorso =
    visible(lShoulder) && visible(rShoulder) && visible(lHip) && visible(rHip)

  let torso: number | undefined
  let nose: Vec2 | undefined
  let hands: Vec2 | undefined

  if (haveTorso) {
    const midShoulder = mid(p(lShoulder), p(rShoulder))
    const midHip = mid(p(lHip), p(rHip))
    torso = dist(midShoulder, midHip)

    // Spine tilt from vertical (mid-hip -> mid-shoulder).
    m.spineAngle = angleFromVertical(sub(midShoulder, midHip))
    // Shoulder / hip line tilt from horizontal (lead point relative to trail).
    m.shoulderTilt = angleFromHorizontal(
      p(l[trail.shoulder]),
      p(l[lead.shoulder]),
    )
    m.hipTilt = angleFromHorizontal(p(l[trail.hip]), p(l[lead.hip]))
  }

  // Knee flex angles.
  if (
    visible(l[lead.hip]) &&
    visible(l[lead.knee]) &&
    visible(l[lead.ankle])
  ) {
    m.leadKneeFlex = jointAngle(p(l[lead.hip]), p(l[lead.knee]), p(l[lead.ankle]))
  }
  if (
    visible(l[trail.hip]) &&
    visible(l[trail.knee]) &&
    visible(l[trail.ankle])
  ) {
    m.trailKneeFlex = jointAngle(
      p(l[trail.hip]),
      p(l[trail.knee]),
      p(l[trail.ankle]),
    )
  }

  if (visible(l[LM.NOSE])) nose = p(l[LM.NOSE])
  if (visible(l[lead.wrist]) && visible(l[trail.wrist])) {
    hands = mid(p(l[lead.wrist]), p(l[trail.wrist]))
  }

  const hipTurnRaw = worldTurn(frame.worldLandmarks, LM.LEFT_HIP, LM.RIGHT_HIP)
  const shoulderTurnRaw = worldTurn(
    frame.worldLandmarks,
    LM.LEFT_SHOULDER,
    LM.RIGHT_SHOULDER,
  )

  return { metrics: m, nose, torso, hands, hipTurnRaw, shoulderTurnRaw }
}

/** Circular difference of two angles in degrees, result in (-180, 180]. */
function angleDelta(a: number, b: number): number {
  let d = a - b
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

/**
 * Build the full metric timeline, baselining head drift and rotation against
 * the chosen address frame.
 */
export function computeMetrics(
  frames: FrameData[],
  handedness: Handedness,
  addressIndex: number,
): FrameMetrics[] {
  const raw = frames.map((f) => rawMetrics(f, handedness))

  // Establish baselines from the address frame (fall back to first valid one).
  const baseIdx = raw[addressIndex]?.nose
    ? addressIndex
    : raw.findIndex((r) => r.nose)
  const base = baseIdx >= 0 ? raw[baseIdx] : undefined
  const baseNose = base?.nose
  const baseTorso = base?.torso || 1
  const baseHipTurn = base?.hipTurnRaw
  const baseShoulderTurn = base?.shoulderTurnRaw

  return raw.map((r) => {
    const m = r.metrics
    if (r.nose && baseNose) {
      m.headSway = (r.nose.x - baseNose.x) / baseTorso
      m.headLift = (r.nose.y - baseNose.y) / baseTorso
    }
    if (r.hipTurnRaw !== undefined && baseHipTurn !== undefined) {
      m.hipTurn = angleDelta(r.hipTurnRaw, baseHipTurn)
    }
    if (r.shoulderTurnRaw !== undefined && baseShoulderTurn !== undefined) {
      m.shoulderTurn = angleDelta(r.shoulderTurnRaw, baseShoulderTurn)
    }
    return m
  })
}

/** Hand-midpoint path (normalized coords) used for the tracer and events. */
export function handPath(
  frames: FrameData[],
  handedness: Handedness,
): (Vec2 | null)[] {
  const lead = leadSide(handedness)
  const trail = trailSide(handedness)
  return frames.map((f) => {
    const l = f.landmarks
    if (!l) return null
    if (visible(l[lead.wrist]) && visible(l[trail.wrist])) {
      return mid(p(l[lead.wrist]), p(l[trail.wrist]))
    }
    if (visible(l[lead.wrist])) return p(l[lead.wrist])
    return null
  })
}

/** Estimate address, top-of-backswing, and impact frames from the hand path. */
export function detectEvents(
  frames: FrameData[],
  handedness: Handedness,
): SwingEvents {
  const path = handPath(frames, handedness)
  const events: SwingEvents = {}

  // Address = first frame with a valid pose.
  const addressIdx = path.findIndex((pt) => pt !== null)
  if (addressIdx < 0) return events
  events.address = addressIdx

  // Top of backswing = highest hands (min y) after address.
  let topIdx = addressIdx
  let minY = Infinity
  for (let i = addressIdx; i < path.length; i++) {
    const pt = path[i]
    if (pt && pt.y < minY) {
      minY = pt.y
      topIdx = i
    }
  }
  events.top = topIdx

  // Impact = fastest hand movement after the top (down-swing acceleration peak).
  let impactIdx = topIdx
  let maxSpeed = -Infinity
  for (let i = topIdx + 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (a && b) {
      const speed = dist(a, b)
      if (speed > maxSpeed) {
        maxSpeed = speed
        impactIdx = i
      }
    }
  }
  events.impact = impactIdx

  return events
}

/** Metric keys relevant to each camera view, in display order. */
export const VIEW_METRICS: Record<
  ViewType,
  { key: keyof FrameMetrics; label: string; unit: string; hint: string }[]
> = {
  'face-on': [
    { key: 'spineAngle', label: 'Spine tilt', unit: '°', hint: 'from vertical' },
    { key: 'shoulderTilt', label: 'Shoulder tilt', unit: '°', hint: 'from level' },
    { key: 'hipTilt', label: 'Hip tilt', unit: '°', hint: 'from level' },
    { key: 'headSway', label: 'Head sway', unit: '×torso', hint: 'lateral drift' },
    { key: 'headLift', label: 'Head lift/dip', unit: '×torso', hint: 'vertical drift' },
    { key: 'leadKneeFlex', label: 'Lead knee', unit: '°', hint: '180 = straight' },
  ],
  'down-the-line': [
    { key: 'spineAngle', label: 'Spine angle', unit: '°', hint: 'posture from vertical' },
    { key: 'hipTurn', label: 'Hip turn', unit: '°', hint: 'vs. address (approx)' },
    { key: 'shoulderTurn', label: 'Shoulder turn', unit: '°', hint: 'vs. address (approx)' },
    { key: 'headSway', label: 'Head move', unit: '×torso', hint: 'toward/away' },
    { key: 'headLift', label: 'Head lift/dip', unit: '×torso', hint: 'vertical drift' },
    { key: 'trailKneeFlex', label: 'Trail knee', unit: '°', hint: '180 = straight' },
  ],
}

export function buildResult(
  frames: FrameData[],
  fps: number,
  handedness: Handedness,
): AnalysisResult {
  const events = detectEvents(frames, handedness)
  const addressIndex = events.address ?? 0
  const metrics = computeMetrics(frames, handedness, addressIndex)
  return { frames, metrics, fps, addressIndex, events }
}
