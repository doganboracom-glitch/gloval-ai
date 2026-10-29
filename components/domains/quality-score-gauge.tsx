import type { ScoreBand } from '@/lib/domains/quality-score'
import { BAND_TEXT_CLASS } from '@/lib/domains/quality-score-copy'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function QualityScoreGauge({ score, band, label }: { score: number; band: ScoreBand; label: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={label} className="size-36 shrink-0">
      <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
        transform="rotate(-90 60 60)"
        className={`stroke-current transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none ${BAND_TEXT_CLASS[band]}`}
      />
      <text
        x="60"
        y="56"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-display text-3xl font-bold"
      >
        {score}
      </text>
      <text x="60" y="80" textAnchor="middle" className="fill-muted-foreground text-xs">
        /100
      </text>
    </svg>
  )
}
