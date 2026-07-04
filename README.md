# ⛳ Swing Analyzer

A browser-based golf swing analyzer. Upload a swing video and get:

- a **stick-man overlay** (pose skeleton) tracked frame-by-frame,
- a **swing tracer** showing the path of your hands (with an optional estimated
  club shaft), and
- **view-aware metrics** — spine tilt, shoulder/hip tilt, head movement, knee
  flex, and approximate hip/shoulder rotation — plotted across the whole swing.

Everything runs **entirely in your browser**. The video never leaves your
device, and after a one-time asset setup it works fully offline.

## How it works

- **Pose estimation** uses [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
  (BlazePose, 33 landmarks) running in WebAssembly.
- The video is stepped through **frame by frame** (seek-based, so every sampled
  frame is analyzed deterministically) and each frame's landmarks are stored.
- An overlay `<canvas>` is synced to the video via `requestAnimationFrame`, so
  the skeleton and tracer play back and scrub in lockstep with the footage.
- Metrics are derived from the landmarks (see `src/lib/metrics.ts`) and
  baselined against the detected **address** frame.

## Camera views

The two supported angles surface different, meaningful metrics:

| View | What it's good for | Key metrics |
| --- | --- | --- |
| **Face-on** (camera in front) | sway, tilt, posture | spine tilt, shoulder/hip tilt, head sway & lift, lead-knee flex |
| **Down-the-line** (behind, on the target line) | rotation, plane, posture | spine angle, hip turn, shoulder turn, head movement, trail-knee flex |

Rotation ("turn") is estimated from MediaPipe's 3D world landmarks. Because this
is a single 2D camera, rotation and the club estimate are **approximations** —
best used to track changes in your own swing over time, not as lab-grade numbers.

## Recording tips

- Keep the camera **steady** (tripod or propped up) and roughly hip height.
- Get your **whole body in frame** for the entire swing.
- Good, even lighting and a contrasting background improve tracking.
- **Face-on:** camera directly in front of you, perpendicular to the target line.
- **Down-the-line:** camera directly behind you, looking down the target line.

## Getting started

Requirements: Node 18+.

```bash
npm install        # also runs `npm run setup` to fetch the pose model + WASM
npm run dev        # start the dev server (http://localhost:5173)
```

`npm run setup` copies the MediaPipe WASM runtime out of `node_modules` and
downloads the pose-landmarker model (~9 MB) into `public/`. These assets are
git-ignored; rerun `npm run setup` if you ever need to re-fetch them.

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run setup` | Fetch/copy the ML assets into `public/` |

## Usage

1. **Upload** a swing video (`.mp4`, `.mov`, `.webm`, …).
2. Pick your **view** (face-on / down-the-line) and **handedness**.
3. Click **Analyze swing**. The first run loads the model into memory; after
   that, analysis is a frame-stepping pass over the video.
4. Play or scrub the video — the stick-man and tracer follow along. Use the
   **Address / Top / Impact** buttons to jump to detected key positions, and
   click the timeline chart to jump anywhere.

## Project structure

```
src/
  App.tsx                 # UI + orchestration (upload, analyze, render loop)
  types.ts                # shared types
  lib/
    pose.ts               # MediaPipe landmarker + frame-stepping analysis
    landmarks.ts          # BlazePose index map + skeleton connections
    geometry.ts           # small 2D vector/angle helpers
    metrics.ts            # per-frame metrics, event detection, view config
    draw.ts               # skeleton, tracer, and club-estimate rendering
  components/
    MetricsPanel.tsx      # live metric readout for the current frame
    Timeline.tsx          # metric chart + event markers + scrubber
scripts/
  setup-assets.mjs        # copies WASM + downloads the model into public/
```

## Limitations & roadmap

- Single-camera 2D estimates; rotation and club path are approximations.
- The "club" is inferred from the lead forearm, not detected directly. A future
  version could add clubhead detection/tracking for a true tracer.
- Event detection (address/top/impact) is heuristic (hand height/speed).
- Best results with a clear, full-body, steady shot.

## Credits

Pose estimation by Google's [MediaPipe](https://github.com/google-ai-edge/mediapipe)
(Apache-2.0). Application code in this repo is provided as-is for personal use.
