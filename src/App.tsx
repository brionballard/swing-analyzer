import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeVideo } from './lib/pose'
import { buildResult, handPath } from './lib/metrics'
import { renderOverlay } from './lib/draw'
import { LM } from './lib/landmarks'
import type { Vec2 } from './lib/geometry'
import { MetricsPanel } from './components/MetricsPanel'
import { Timeline } from './components/Timeline'
import type { AnalysisResult, Handedness, ViewType } from './types'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading-model' }
  | { kind: 'analyzing'; progress: number }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [view, setView] = useState<ViewType>('face-on')
  const [handedness, setHandedness] = useState<Handedness>('right')
  const [fps, setFps] = useState(30)

  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [currentIndex, setCurrentIndex] = useState(0)

  const [showSkeleton, setShowSkeleton] = useState(true)
  const [showTracer, setShowTracer] = useState(true)
  const [showClub, setShowClub] = useState(true)

  // Hand path is derived once per analysis and reused for the tracer.
  const tracerPath = useRef<(Vec2 | null)[]>([])

  const leadWrist = handedness === 'right' ? LM.LEFT_WRIST : LM.RIGHT_WRIST
  const leadElbow = handedness === 'right' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW

  const onFile = useCallback((file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setResult(null)
    setStatus({ kind: 'idle' })
    setCurrentIndex(0)
    tracerPath.current = []
  }, [videoUrl])

  const runAnalysis = useCallback(async () => {
    const video = videoRef.current
    if (!video) return
    try {
      setStatus({ kind: 'loading-model' })
      // Ensure metadata is ready.
      if (video.readyState < 1) {
        await new Promise<void>((res) => {
          const h = () => {
            video.removeEventListener('loadedmetadata', h)
            res()
          }
          video.addEventListener('loadedmetadata', h)
        })
      }
      setStatus({ kind: 'analyzing', progress: 0 })
      const frames = await analyzeVideo(video, {
        fps,
        handedness,
        view,
        onProgress: (p) => setStatus({ kind: 'analyzing', progress: p }),
      })
      const res = buildResult(frames, fps, handedness)
      tracerPath.current = handPath(frames, handedness)
      setResult(res)
      setCurrentIndex(res.addressIndex)
      video.currentTime = frames[res.addressIndex]?.time ?? 0
      setStatus({ kind: 'done' })
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [fps, handedness, view])

  // Re-baseline metrics when handedness changes after an analysis.
  useEffect(() => {
    if (!result) return
    tracerPath.current = handPath(result.frames, handedness)
    setResult((prev) =>
      prev ? buildResult(prev.frames, prev.fps, handedness) : prev,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedness])

  const nearestIndex = useCallback(
    (time: number): number => {
      const frames = result?.frames
      if (!frames || frames.length === 0) return 0
      // Frames are evenly sampled; estimate then refine locally.
      let idx = Math.round(time * fps)
      idx = Math.max(0, Math.min(frames.length - 1, idx))
      // refine against actual stored times
      while (idx > 0 && frames[idx].time > time) idx--
      while (idx < frames.length - 1 && frames[idx + 1].time <= time) idx++
      return idx
    },
    [result, fps],
  )

  // Overlay render loop, synced to the video via requestAnimationFrame.
  useEffect(() => {
    if (!result) return
    let raf = 0
    const loop = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas) {
        const idx = nearestIndex(video.currentTime)
        setCurrentIndex((prev) => (prev === idx ? prev : idx))
        renderOverlay(canvas, video, {
          showSkeleton,
          showTracer,
          showClubEstimate: showClub,
          tracer: tracerPath.current.slice(0, idx + 1),
          landmarks: result.frames[idx]?.landmarks ?? null,
          leadWrist,
          leadElbow,
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [result, showSkeleton, showTracer, showClub, nearestIndex, leadWrist, leadElbow])

  const seekToIndex = useCallback(
    (idx: number) => {
      const video = videoRef.current
      const frame = result?.frames[idx]
      if (video && frame) {
        video.pause()
        video.currentTime = frame.time
      }
    },
    [result],
  )

  const currentMetrics = result?.metrics[currentIndex]
  const busy = status.kind === 'loading-model' || status.kind === 'analyzing'

  const statusText = useMemo(() => {
    switch (status.kind) {
      case 'loading-model':
        return 'Loading pose model…'
      case 'analyzing':
        return `Analyzing… ${Math.round(status.progress * 100)}%`
      case 'error':
        return `Error: ${status.message}`
      default:
        return ''
    }
  }, [status])

  return (
    <div className="app">
      <header className="app-header">
        <h1>⛳ Swing Analyzer</h1>
        <p className="tagline">
          Upload a face-on or down-the-line swing. Everything runs in your
          browser — the video never leaves your device.
        </p>
      </header>

      <section className="controls">
        <label className="file-btn">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
          {videoUrl ? 'Choose another video' : 'Upload swing video'}
        </label>

        <div className="control-group">
          <span className="control-label">View</span>
          <div className="segmented">
            <button
              className={view === 'face-on' ? 'active' : ''}
              onClick={() => setView('face-on')}
            >
              Face-on
            </button>
            <button
              className={view === 'down-the-line' ? 'active' : ''}
              onClick={() => setView('down-the-line')}
            >
              Down-the-line
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Handedness</span>
          <div className="segmented">
            <button
              className={handedness === 'right' ? 'active' : ''}
              onClick={() => setHandedness('right')}
            >
              Right
            </button>
            <button
              className={handedness === 'left' ? 'active' : ''}
              onClick={() => setHandedness('left')}
            >
              Left
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Sample rate</span>
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            <option value={15}>15 fps (fast)</option>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps (detailed)</option>
          </select>
        </div>

        <button
          className="analyze-btn"
          disabled={!videoUrl || busy}
          onClick={runAnalysis}
        >
          {busy ? 'Working…' : 'Analyze swing'}
        </button>
      </section>

      {statusText && (
        <div
          className={`status ${status.kind === 'error' ? 'status-error' : ''}`}
        >
          {statusText}
          {status.kind === 'analyzing' && (
            <div className="progress">
              <div
                className="progress-bar"
                style={{ width: `${status.progress * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <main className="stage-wrap">
        <div className="stage">
          {videoUrl ? (
            <div className="video-box">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                playsInline
                className="video"
              />
              <canvas ref={canvasRef} className="overlay" />
            </div>
          ) : (
            <div className="empty">
              <p>No video yet.</p>
              <p className="muted">
                Record your swing face-on (camera in front, hips-height) or
                down-the-line (behind you, on the target line), then upload it
                above.
              </p>
            </div>
          )}

          {result && (
            <div className="overlay-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={showSkeleton}
                  onChange={(e) => setShowSkeleton(e.target.checked)}
                />
                Stick-man
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showTracer}
                  onChange={(e) => setShowTracer(e.target.checked)}
                />
                Tracer
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showClub}
                  onChange={(e) => setShowClub(e.target.checked)}
                />
                Club estimate
              </label>
              <div className="jump-buttons">
                {result.events.address !== undefined && (
                  <button onClick={() => seekToIndex(result.events.address!)}>
                    Address
                  </button>
                )}
                {result.events.top !== undefined && (
                  <button onClick={() => seekToIndex(result.events.top!)}>
                    Top
                  </button>
                )}
                {result.events.impact !== undefined && (
                  <button onClick={() => seekToIndex(result.events.impact!)}>
                    Impact
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {result && (
          <aside className="sidebar">
            <MetricsPanel
              view={view}
              metrics={currentMetrics}
              events={result.events}
              currentIndex={currentIndex}
            />
            <Timeline
              result={result}
              view={view}
              currentIndex={currentIndex}
              onSeek={seekToIndex}
            />
          </aside>
        )}
      </main>

      <footer className="app-footer">
        <span>
          Pose by MediaPipe Tasks Vision · runs locally · {result
            ? `${result.frames.length} frames analyzed`
            : 'no analysis yet'}
        </span>
      </footer>
    </div>
  )
}
