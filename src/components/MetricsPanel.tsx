import { VIEW_METRICS } from '../lib/metrics'
import type { FrameMetrics, SwingEvents, ViewType } from '../types'

interface Props {
  view: ViewType
  metrics?: FrameMetrics
  events: SwingEvents
  currentIndex: number
}

function fmt(v: number | undefined, unit: string): string {
  if (v === undefined || Number.isNaN(v)) return '—'
  const digits = unit === '×torso' ? 2 : 0
  const s = v.toFixed(digits)
  return `${v > 0 && unit === '°' ? '+' : ''}${s}${unit === '°' ? '°' : ''}`
}

export function MetricsPanel({ view, metrics, events, currentIndex }: Props) {
  const rows = VIEW_METRICS[view]

  const eventLabel = (() => {
    if (currentIndex === events.address) return 'Address'
    if (currentIndex === events.top) return 'Top of backswing'
    if (currentIndex === events.impact) return 'Impact'
    return null
  })()

  return (
    <div className="metrics-panel">
      <div className="panel-head">
        <h3>Metrics</h3>
        {eventLabel && <span className="event-chip">{eventLabel}</span>}
      </div>
      <div className="metric-grid">
        {rows.map((r) => {
          const value = metrics?.[r.key] as number | undefined
          return (
            <div className="metric-cell" key={r.key}>
              <div className="metric-value">
                {fmt(value, r.unit)}
                {r.unit === '×torso' && value !== undefined && (
                  <span className="metric-unit"> ×t</span>
                )}
              </div>
              <div className="metric-label">{r.label}</div>
              <div className="metric-hint">{r.hint}</div>
            </div>
          )
        })}
      </div>
      <p className="disclaimer">
        Rotation and club estimates are approximations from a single 2D camera —
        useful for tracking changes over time, not tour-lab exact.
      </p>
    </div>
  )
}
