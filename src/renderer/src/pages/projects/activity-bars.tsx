const BAR = 7
const GAP = 2
const HEIGHT = 28

/** Barra com só os cantos de cima arredondados, apoiada na linha de base. */
function barPath(x: number, h: number): string {
  const r = Math.min(2, h / 2, BAR / 2)
  const y = HEIGHT - h
  return `M${x},${HEIGHT}V${y + r}Q${x},${y} ${x + r},${y}H${x + BAR - r}Q${x + BAR},${y} ${x + BAR},${y + r}V${HEIGHT}Z`
}

/** Rótulo relativo (o GitHub fecha as semanas no domingo; datas exatas poderiam enganar). */
const weekLabel = (weeksAgo: number): string =>
  weeksAgo === 0 ? 'Esta semana' : weeksAgo === 1 ? 'Semana passada' : `Há ${weeksAgo} semanas`

/**
 * Commits por semana nas últimas 12 semanas (série única: sem legenda; o total ao lado diz o
 * que é). Semanas anteriores em tom discreto, a atual na cor de destaque; tooltip por barra.
 */
export function ActivityBars({ weeks }: { weeks: number[] }): React.JSX.Element {
  const max = Math.max(1, ...weeks)
  const total = weeks.reduce((a, b) => a + b, 0)
  const width = weeks.length * (BAR + GAP) - GAP

  return (
    <div className="flex items-end gap-3">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`${total} commits nas últimas 12 semanas`}
        className="shrink-0 overflow-visible"
      >
        {weeks.map((count, i) => {
          const x = i * (BAR + GAP)
          const current = i === weeks.length - 1
          const h = count === 0 ? 2 : Math.max(4, Math.round((count / max) * HEIGHT))
          return (
            <g key={i}>
              <path
                d={barPath(x, h)}
                className={
                  count === 0
                    ? 'fill-muted-foreground/25'
                    : current
                      ? 'fill-primary'
                      : 'fill-muted-foreground/55'
                }
              />
              {/* área de toque maior que a barra */}
              <rect x={x - GAP / 2} y={0} width={BAR + GAP} height={HEIGHT} fill="transparent">
                <title>
                  {weekLabel(weeks.length - 1 - i)}: {count} {count === 1 ? 'commit' : 'commits'}
                </title>
              </rect>
            </g>
          )
        })}
      </svg>
      <span className="text-xs leading-tight text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{total}</span>{' '}
        {total === 1 ? 'commit' : 'commits'}
        <br />
        em 12 semanas
      </span>
    </div>
  )
}
