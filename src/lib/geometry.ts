import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface Vec2 {
  x: number
  y: number
}

export const mid = (a: Vec2, b: Vec2): Vec2 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })

export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Signed angle of a vector from vertical (straight up on screen), in degrees.
 * Screen y grows downward, so "up" is -y. Returns 0 when the vector points
 * straight up. Positive = leaning to the image-right.
 */
export function angleFromVertical(v: Vec2): number {
  // atan2(x, -y): angle between v and the up axis (0,-1)
  return (Math.atan2(v.x, -v.y) * 180) / Math.PI
}

/**
 * Signed angle of a line from horizontal, in degrees. Positive means the
 * `to` point is higher on screen than the `from` point.
 */
export function angleFromHorizontal(from: Vec2, to: Vec2): number {
  const d = sub(to, from)
  // negate y because screen y is inverted vs. math convention
  return (Math.atan2(-d.y, d.x) * 180) / Math.PI
}

/** Interior angle at vertex `b` formed by points a-b-c, in degrees [0..180]. */
export function jointAngle(a: Vec2, b: Vec2, c: Vec2): number {
  const ba = sub(a, b)
  const bc = sub(c, b)
  const cos = (ba.x * bc.x + ba.y * bc.y) / (len(ba) * len(bc) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** True if a landmark is present and confidently visible. */
export function visible(lm: NormalizedLandmark | undefined, min = 0.3): boolean {
  return !!lm && (lm.visibility ?? 1) >= min
}
