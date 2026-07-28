import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatNumber } from '../utils/format'

function formatDateLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
}

function formatAxis(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  if (Math.abs(number) >= 1000000000) return `${(number / 1000000000).toFixed(1)} bi`
  if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(1)} mi`
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(0)} mil`
  return String(Math.round(number))
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const row = payload[0]?.payload ?? {}

  return (
    <div className="asset-chart-tooltip">
      <strong>{formatDateLabel(label)}</strong>
      <span>Fechamento: {formatCurrency(row.close)}</span>
      <span>Maxima: {formatCurrency(row.high)}</span>
      <span>Minima: {formatCurrency(row.low)}</span>
      <span>Volume: {formatNumber(row.volume)}</span>
      {row.sma21 != null && <span>MM21: {formatCurrency(row.sma21)}</span>}
      {row.sma50 != null && <span>MM50: {formatCurrency(row.sma50)}</span>}
      {row.sma200 != null && <span>MM200: {formatCurrency(row.sma200)}</span>}
    </div>
  )
}

export default function AssetHistoryChart({ series }) {
  return (
    <div className="asset-chart-shell">
      <div className="asset-price-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={series}
            margin={{ top: 10, right: 18, left: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              minTickGap={32}
              tickFormatter={formatDateLabel}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              yAxisId="price"
              domain={['auto', 'auto']}
              tickFormatter={(value) => `R$ ${Number(value).toFixed(0)}`}
              tick={{ fontSize: 11 }}
              width={60}
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              tickFormatter={formatAxis}
              tick={{ fontSize: 10 }}
              width={54}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              name="Fechamento"
              fillOpacity={0.16}
              strokeWidth={2}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="sma21"
              name="MM21"
              dot={false}
              connectNulls
              strokeWidth={1.5}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="sma50"
              name="MM50"
              dot={false}
              connectNulls
              strokeWidth={1.5}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="sma200"
              name="MM200"
              dot={false}
              connectNulls
              strokeWidth={1.5}
            />
            <Bar
              yAxisId="volume"
              dataKey="volume"
              name="Volume"
              opacity={0.24}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
