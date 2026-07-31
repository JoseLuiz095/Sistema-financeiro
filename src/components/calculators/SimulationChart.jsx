import {
  useEffect,
  useId,
  useState,
} from 'react'
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../utils/format'

function compactCurrency(value) {
  const amount = Number(value ?? 0)
  return amount.toLocaleString('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
}

function useCompactChart() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 640px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setCompact(media.matches)

    update()
    media.addEventListener?.('change', update)

    return () => {
      media.removeEventListener?.('change', update)
    }
  }, [])

  return compact
}

export default function SimulationChart({
  data,
  series,
  title = 'Evolução da simulação',
}) {
  const compact = useCompactChart()
  const gradientPrefix = useId()
    .replace(/:/g, '')

  if (!Array.isArray(data) || data.length < 2) {
    return null
  }

  return (
    <section className="calculator-chart-block">
      <div className="calculator-chart-heading">
        <div>
          <span className="eyebrow">Projeção visual</span>
          <h3>{title}</h3>
        </div>
        <small>
          Toque no gráfico ou passe o cursor para ver os valores.
        </small>
      </div>

      <div className="calculator-chart mobile-portrait-chart personal-private-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={
              compact
                ? { top: 10, right: 4, left: -14, bottom: 0 }
                : { top: 12, right: 12, left: 0, bottom: 4 }
            }
          >
            <defs>
              {series.map((item, index) => {
                const gradientId =
                  `${gradientPrefix}-${item.key}`

                return (
                  <linearGradient
                    id={gradientId}
                    key={item.key}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={item.color}
                      stopOpacity={0.28 - index * 0.05}
                    />
                    <stop
                      offset="95%"
                      stopColor={item.color}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              minTickGap={compact ? 34 : 24}
              tick={{ fontSize: compact ? 10 : 12 }}
              tickMargin={8}
            />
            <YAxis
              width={compact ? 52 : 64}
              tickFormatter={compactCurrency}
              tick={{ fontSize: compact ? 10 : 12 }}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(value),
                name,
              ]}
              contentStyle={{
                maxWidth: compact ? 220 : 320,
                borderRadius: 12,
                borderColor: '#d7e1ec',
                boxShadow:
                  '0 12px 28px rgba(30, 51, 78, 0.12)',
                fontSize: compact ? 12 : 13,
              }}
            />
            {!compact && <Legend />}
            {series.map((item) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                fill={`url(#${gradientPrefix}-${item.key})`}
                strokeWidth={compact ? 2 : 2.5}
                activeDot={{ r: compact ? 4 : 5 }}
                animationDuration={compact ? 420 : 650}
              />
            ))}
            {!compact && data.length > 12 && (
              <Brush
                dataKey="period"
                height={24}
                travellerWidth={8}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {compact && (
        <div className="calculator-chart-mobile-legend">
          {series.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
