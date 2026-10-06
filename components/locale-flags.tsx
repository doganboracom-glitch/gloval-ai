import type { SupportedLocale } from '@/lib/locale-registry'

/**
 * Deterministic, dependency-free flag icons for the language switcher.
 *
 * Root cause of the "TR TR" / broken-flag production bug: the switcher used
 * to render Unicode regional-indicator emoji flags (e.g. "🇹🇷"). Those glyphs
 * require an OS-level color-emoji font. Windows (and several Linux desktop
 * configurations) have NO such font for flag sequences by default, so the
 * two regional-indicator characters render as their literal two-letter
 * fallback glyphs instead of a flag — visually producing "TR" right next to
 * the switcher's own "TR" locale-code label, i.e. "TR TR". This is a platform
 * font gap, not a bug in the switcher's markup, and it is invisible in any
 * environment that happens to ship a color-emoji font (which is why it only
 * showed up on some real users' screens).
 *
 * Fix: render every flag as an inline SVG so it looks identical on every OS
 * and browser, with no new dependency.
 */
function Stripes({ colors, vertical = false }: { colors: string[]; vertical?: boolean }) {
  const n = colors.length
  return (
    <>
      {colors.map((color, i) =>
        vertical ? (
          <rect key={i} x={(20 / n) * i} y={0} width={20 / n} height={15} fill={color} />
        ) : (
          <rect key={i} x={0} y={(15 / n) * i} width={20} height={15 / n} fill={color} />
        ),
      )}
    </>
  )
}

function CrescentStar({ fill = '#fff', cx = 8.2, r = 3.6 }: { fill?: string; cx?: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={7.5} r={r} fill={fill} />
      <circle cx={cx + 1.15} cy={7.5} r={r * 0.82} fill="currentColor" />
      <polygon
        fill={fill}
        points="11.4,7.5 12.6,8.25 12.3,9.6 11.1,8.85 9.9,9.6 10.2,8.25 9.3,7.35 10.65,7.2"
      />
    </>
  )
}

const FLAGS: Record<SupportedLocale, React.ReactNode> = {
  tr: (
    <g>
      <rect width={20} height={15} fill="#e30a17" />
      <g className="text-[#e30a17]">
        <CrescentStar />
      </g>
    </g>
  ),
  en: (
    <g>
      <rect width={20} height={15} fill="#0a3161" />
      <Stripes colors={['#b31942', '#fff', '#b31942', '#fff', '#b31942', '#fff', '#b31942']} />
      <rect width={9} height={7.5} fill="#0a3161" />
    </g>
  ),
  fr: <Stripes colors={['#0055a4', '#fff', '#ef4135']} vertical />,
  de: <Stripes colors={['#000', '#dd0000', '#ffce00']} />,
  it: <Stripes colors={['#009246', '#fff', '#ce2b37']} vertical />,
  et: <Stripes colors={['#0072ce', '#000', '#fff']} />,
  pl: <Stripes colors={['#fff', '#dc143c']} />,
  es: (
    <g>
      <rect width={20} height={15} fill="#aa151b" />
      <rect y={3.75} width={20} height={7.5} fill="#f1bf00" />
    </g>
  ),
  pt: (
    <g>
      <rect width={8} height={15} fill="#006600" />
      <rect x={8} width={12} height={15} fill="#ff0000" />
      <circle cx={8} cy={7.5} r={2.4} fill="#f1bf00" stroke="#fff" strokeWidth={0.4} />
    </g>
  ),
  ar: (
    <g>
      <rect width={20} height={15} fill="#006c35" />
      <rect x={3} y={6.2} width={14} height={2.6} rx={1.3} fill="#fff" />
    </g>
  ),
  ru: <Stripes colors={['#fff', '#0039a6', '#d52b1e']} />,
  az: (
    <g>
      <Stripes colors={['#00b9e4', '#e4312b', '#00af66']} />
      <g className="text-[#e4312b]" transform="translate(-1.5, 0) scale(0.85)" style={{ transformOrigin: '8.2px 7.5px' }}>
        <CrescentStar r={3} cx={9.2} />
      </g>
    </g>
  ),
}

/** Fixed-aspect (20x15) flag chip, rendered deterministically via inline SVG. */
export function LocaleFlag({ code, className }: { code: SupportedLocale; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 15"
      width="20"
      height="15"
      role="img"
      aria-hidden="true"
      className={className}
    >
      <clipPath id={`flag-clip-${code}`}>
        <rect width={20} height={15} rx={2} />
      </clipPath>
      <g clipPath={`url(#flag-clip-${code})`}>{FLAGS[code]}</g>
    </svg>
  )
}
