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

export default function SimulationChart({
  data,
  series,
  title = 'Evolução da simulação',
}) {
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
          Passe o cursor ou toque nos pontos para ver os valores.
        </small>
      </div>

      <div className="calculator-chart personal-private-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
          >
            <defs>
              {series.map((item, index) => (
                <linearGradient
                  id={`calculator-gradient-${item.key}`}
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
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" minTickGap={24} />
            <YAxis
              width={64}
              tickFormatter={compactCurrency}
            />
            <Tooltip
              formatter={(value, name) => [formatCurrency(value), name]}
              contentStyle={{
                borderRadius: 12,
                borderColor: '#d7e1ec',
                boxShadow: '0 12px 28px rgba(30, 51, 78, 0.12)',
              }}
            />
            <Legend />
            {series.map((item) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                fill={`url(#calculator-gradient-${item.key})`}
                strokeWidth={2.5}
                activeDot={{ r: 5 }}
                animationDuration={650}
              />
            ))}
            {data.length > 12 && (
              <Brush
                dataKey="period"
                height={24}
                travellerWidth={8}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
