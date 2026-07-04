import { useMemo, useState } from 'react'
import { VIEW_METRICS } from '../lib/metrics'
import type { AnalysisResult, FrameMetrics, ViewType } from '../types'

interface Props {
  result: AnalysisResult
  view: ViewType
  currentIndex: number
  onSeek: (index: number) => void
}

const W = 640
const H = 140
const PAD = 24

export function Timeline({ result, view, currentIndex, onSeek }: Props) {
  const options = VIEW_METRICS[view]
  const [metricKey, setMetricKey] = useState<keyof FrameMetrics>(options[0].key)

  // Reset selection if the view changed to one lacking the current metric.
  const activeKey = options.some((o) => o.key === metricKey)
    ? metricKey
    : options[0].key

  const { path, minV, maxV } = useMemo(() => {
    const values = result.metrics.map((m) => m[activeKey] as number | undefined)
    const nums = values.filter(
      (v): v is number => v !== undefined && !Number.isNaN(v),
    )
    if (nums.length === 0) return { path: '', minV: 0, maxV: 1 }
    let lo = Math.min(...nums)
    let hi = Math.max(...nums)
    if (lo === hi) {
      lo -= 1
      hi += 1
    }
    const n = result.metrics.length
    const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD)
    const y = (v: number) =>
      H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)

    let d = ''
    let started = false
    values.forEach((v, i) => {
      if (v === undefined || Number.isNaN(v)) {
        started = false
        return
      }
      d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      started = true
    })
    return { path: d, minV: lo, maxV: hi }
  }, [result.metrics, activeKey])

  const n = result.metrics.length
  const xForIndex = (i: number) =>
    PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD)
  const indexForX = (clientX: number, rectLeft: number, rectWidth: number) => {
    const rel = ((clientX - rectLeft) / rectWidth) * W
    const frac = Math.min(1, Math.max(0, (rel - PAD) / (W - 2 * PAD)))
    return Math.round(frac * (n - 1))
  }

  const events: { idx: number | undefined; color: string; label: string }[] = [
    { idx: result.events.address, color: '#5aa9e6', label: 'A' },
    { idx: result.events.top, color: '#ffd166', label: 'T' },
    { idx: result.events.impact, color: '#ff5edb', label: 'I' },
  ]

  return (
    <div className="timeline">
      <div className="timeline-head">
        <label>
          Chart:{' '}
          <select
            value={activeKey}
            onChange={(e) => setMetricKey(e.target.value as keyof FrameMetrics)}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className="range-note">
          {minV.toFixed(1)} … {maxV.toFixed(1)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="timeline-svg"
        onClick={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          onSeek(indexForX(e.clientX, rect.left, rect.width))
        }}
      >
        {/* baseline */}
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="#2a2f3a"
        />
        {/* event markers */}
        {events.map(
          (ev, i) =>
            ev.idx !== undefined && (
              <g key={i}>
                <line
                  x1={xForIndex(ev.idx)}
                  y1={PAD / 2}
                  x2={xForIndex(ev.idx)}
                  y2={H - PAD}
                  stroke={ev.color}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
                <text
                  x={xForIndex(ev.idx)}
                  y={PAD / 2}
                  fill={ev.color}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {ev.label}
                </text>
              </g>
            ),
        )}
        {/* metric line */}
        <path d={path} fill="none" stroke="#3ddc97" strokeWidth={2} />
        {/* playhead */}
        <line
          x1={xForIndex(currentIndex)}
          y1={PAD / 2}
          x2={xForIndex(currentIndex)}
          y2={H - PAD}
          stroke="#ffffff"
          strokeWidth={1.5}
        />
      </svg>
      <p className="timeline-hint">Click the chart to jump the video.</p>
    </div>
  )
}
