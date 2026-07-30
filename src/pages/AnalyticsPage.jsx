import { useEffect, useState } from 'react'
import AppIcon from '../components/AppIcon'
import AssetAnalysisPage from './AssetAnalysisPage'
import DashboardPage from './DashboardPage'
import DebtsPage from './DebtsPage'
import InvestmentInsightsPage from './InvestmentInsightsPage'
import ReportsPage from './ReportsPage'

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
          importedPositions={importedInvestmentPositions}
          setFeedback={setFeedback}
        />
      )}

      {section === 'debts' && (
        <DebtsPage setFeedback={setFeedback} />
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
