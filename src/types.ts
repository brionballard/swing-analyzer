import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/** Which camera angle the video was shot from. Drives which metrics are meaningful. */
export type ViewType = 'face-on' | 'down-the-line'

/** Golfer handedness — needed to know which arm/hand leads the swing. */
export type Handedness = 'right' | 'left'

/** One sampled frame of the video with its detected pose (if any). */
export interface FrameData {
  /** Timestamp in seconds. */
  time: number
  /** Frame index in the sampled sequence. */
  index: number
  /** 33 BlazePose landmarks in normalized [0..1] image space, or null if no pose found. */
  landmarks: NormalizedLandmark[] | null
  /** 33 world landmarks in metric space (meters, hip-centered), or null. */
  worldLandmarks: NormalizedLandmark[] | null
}

/** Per-frame derived metrics. Values are undefined when the pose was not detected. */
export interface FrameMetrics {
  time: number
  index: number
  /** Spine tilt away from vertical, in degrees (mid-hip -> mid-shoulder vs. straight up). */
  spineAngle?: number
  /** Shoulder line tilt from horizontal, in degrees. Positive = lead shoulder up. */
  shoulderTilt?: number
  /** Hip line tilt from horizontal, in degrees. */
  hipTilt?: number
  /** Lead-knee flex angle (hip-knee-ankle), in degrees. 180 = straight leg. */
  leadKneeFlex?: number
  /** Trail-knee flex angle, in degrees. */
  trailKneeFlex?: number
  /** Head horizontal drift from the address baseline, in torso-lengths. + = toward target. */
  headSway?: number
  /** Head vertical drift from the address baseline, in torso-lengths. + = down (dip). */
  headLift?: number
  /** Approx. hip rotation relative to address, in "turn units" (see metrics.ts). */
  hipTurn?: number
  /** Approx. shoulder rotation relative to address, in "turn units". */
  shoulderTurn?: number
}

/** Result of a full video analysis pass. */
export interface AnalysisResult {
  frames: FrameData[]
  metrics: FrameMetrics[]
  fps: number
  /** Index of the detected/selected address frame used as the metric baseline. */
  addressIndex: number
  /** Heuristic key-event indices, when detectable. */
  events: SwingEvents
}

export interface SwingEvents {
  address?: number
  top?: number
  impact?: number
}

export interface AnalyzeOptions {
  /** Sampling rate in frames per second. Lower = faster analysis, coarser trace. */
  fps: number
  handedness: Handedness
  view: ViewType
  onProgress?: (fraction: number) => void
}
