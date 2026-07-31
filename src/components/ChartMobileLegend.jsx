export default function ChartMobileLegend({
  items = [],
  className = '',
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  return (
    <div
      className={`mobile-chart-legend ${className}`.trim()}
      aria-label="Legenda do gráfico"
    >
      {items.map((item) => (
        <span key={item.key ?? item.label}>
          <i
            aria-hidden="true"
            style={{ background: item.color }}
          />
          <strong>{item.label}</strong>
          {item.value ? <em>{item.value}</em> : null}
        </span>
      ))}
    </div>
  )
}
