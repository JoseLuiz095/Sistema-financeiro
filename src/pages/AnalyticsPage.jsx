import { useEffect, useMemo, useState } from 'react'
import AppIcon from '../components/AppIcon'
import AssetAnalysisPage from './AssetAnalysisPage'
import DashboardPage from './DashboardPage'
import DebtsPage from './DebtsPage'
import InvestmentInsightsPage from './InvestmentInsightsPage'
import ReportsPage from './ReportsPage'
import { buildInvestmentInsights } from '../utils/investmentInsights'

const SECTIONS = [
  {
    value: 'overview',
    label: 'Visão financeira',
    icon: 'chart',
  },
  {
    value: 'investments',
    label: 'Investimentos',
    icon: 'trend',
  },
  {
    value: 'assets',
    label: 'Análise de ativos',
    icon: 'analytics',
  },
  {
    value: 'debts',
    label: 'Crédito e dívidas',
    icon: 'debt',
  },
  {
    value: 'reports',
    label: 'Exportar',
    icon: 'export',
  },
]

export default function AnalyticsPage({
  requestedSection,
  user,
  transactions,
  assets = [],
  importedInvestmentPositions = [],
  setFeedback,
}) {
  const [section, setSection] = useState(
    requestedSection || 'overview',
  )

  useEffect(() => {
    if (requestedSection) {
      setSection(requestedSection)
    }
  }, [requestedSection])

  const statementInvestmentInsights = useMemo(
    () => buildInvestmentInsights(transactions ?? []),
    [transactions],
  )

  const analysisPortfolioPositions = useMemo(() => {
    const rows = []
    const knownTickers = new Set()

    for (const position of importedInvestmentPositions ?? []) {
      const ticker = String(
        position?.investment_code ??
          position?.investment_name ??
          '',
      )
        .trim()
        .toUpperCase()

      if (!ticker) continue

      rows.push(position)
      knownTickers.add(ticker)
    }

    for (const asset of statementInvestmentInsights.assets ?? []) {
      const ticker = String(asset?.code ?? '')
        .trim()
        .toUpperCase()

      if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) continue
      if (knownTickers.has(ticker)) continue

      rows.push({
        id: `statement-${ticker}`,
        investment_code: ticker,
        investment_name: asset?.name || ticker,
        investment_type: asset?.type || 'STOCK',
        quantity: 0,
        gross_amount: 0,
        net_balance: 0,
        institution_name: 'Extrato importado',
        position_source: 'STATEMENT_IMPORT',
        statement_movement_count: asset?.movementCount ?? 0,
        estimated_statement_balance: asset?.estimatedBalance ?? 0,
      })
      knownTickers.add(ticker)
    }

    for (const asset of assets ?? []) {
      const ticker = String(asset?.ticker ?? '')
        .trim()
        .toUpperCase()

      if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) continue
      if (knownTickers.has(ticker)) continue

      rows.push({
        id: `registered-${asset.id ?? ticker}`,
        investment_code: ticker,
        investment_name: asset?.asset_name || ticker,
        investment_type: asset?.asset_type || 'STOCK',
        quantity: 0,
        gross_amount: 0,
        net_balance: 0,
        institution_name: 'Ativo identificado no extrato',
        position_source: 'REGISTERED_ASSET',
      })
      knownTickers.add(ticker)
    }

    return rows
  }, [
    assets,
    importedInvestmentPositions,
    statementInvestmentInsights.assets,
  ])

  return (
    <div className="page-stack analytics-page">
      <section className="analytics-heading panel-heading-surface">
        <div className="analytics-title-wrap">
          <div className="section-icon" aria-hidden="true">
            <AppIcon name="analytics" size={24} />
          </div>

          <div>
            <span className="eyebrow">Central de análises</span>
            <h2>Seus dados organizados por objetivo</h2>
            <p>
              Acompanhe receitas, despesas, investimentos, crédito e
              relatórios em visões separadas e fáceis de interpretar.
            </p>
          </div>
        </div>

        <nav
          className="sub-nav analytics-nav"
          aria-label="Seções de análises"
        >
          {SECTIONS.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              className={section === value ? 'active' : ''}
              onClick={() => setSection(value)}
              aria-current={section === value ? 'page' : undefined}
            >
              <AppIcon name={icon} size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </section>

      {section === 'overview' && (
        <DashboardPage
          transactions={transactions}
          importedInvestmentPositions={
            importedInvestmentPositions
          }
        />
      )}

      {section === 'investments' && (
        <InvestmentInsightsPage
          transactions={transactions}
          importedPositions={importedInvestmentPositions}
        />
      )}

      {section === 'assets' && (
        <AssetAnalysisPage
          user={user}
          importedPositions={analysisPortfolioPositions}
          setFeedback={setFeedback}
        />
      )}

      {section === 'debts' && (
        <DebtsPage
          transactions={transactions}
          setFeedback={setFeedback}
        />
      )}

      {section === 'reports' && (
        <ReportsPage
          user={user}
          transactions={transactions}
        />
      )}
    </div>
  )
}
