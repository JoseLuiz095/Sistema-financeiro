import { useEffect, useState } from 'react'
import AppIcon from '../components/AppIcon'
import AssetAnalysisPage from './AssetAnalysisPage'
import DashboardPage from './DashboardPage'
import DebtsPage from './DebtsPage'
import PatrimonyPage from './PatrimonyPage'
import ReportsPage from './ReportsPage'

const SECTIONS = [
  { value: 'overview', label: 'Visao financeira', icon: 'chart' },
  { value: 'assets', label: 'Analise de ativos', icon: 'trend' },
  { value: 'debts', label: 'Credito e dividas', icon: 'debt' },
  { value: 'patrimony', label: 'Patrimonio', icon: 'patrimony' },
  { value: 'reports', label: 'Exportar', icon: 'export' },
]

export default function AnalyticsPage({
  requestedSection,
  user,
  accounts,
  transactions,
  assets,
  operations,
  quotes,
  incomes,
  investmentResult,
  importedInvestmentPositions,
  importedInvestmentTransactions,
  scheduledOccurrences,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState(
    requestedSection || 'overview',
  )

  useEffect(() => {
    if (requestedSection) setSection(requestedSection)
  }, [requestedSection])

  return (
    <div className="page-stack analytics-page">
      <section className="analytics-heading panel-heading-surface">
        <div className="analytics-title-wrap">
          <div className="section-icon" aria-hidden="true">
            <AppIcon name="analytics" size={24} />
          </div>
          <div>
            <span className="eyebrow">Central de analises</span>
            <h2>Detalhes financeiros em formato de BI</h2>
            <p>
              Compare periodos, acompanhe credito, estude ativos e veja a evolucao do patrimonio.
            </p>
          </div>
        </div>

        <nav
          className="sub-nav analytics-nav"
          aria-label="Secoes de analises"
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
          investmentResult={investmentResult}
          importedInvestmentPositions={importedInvestmentPositions}
          scheduledOccurrences={scheduledOccurrences}
        />
      )}

      {section === 'assets' && (
        <AssetAnalysisPage
          user={user}
          assets={assets}
          importedPositions={importedInvestmentPositions}
          setFeedback={setFeedback}
        />
      )}

      {section === 'debts' && (
        <DebtsPage setFeedback={setFeedback} />
      )}

      {section === 'patrimony' && (
        <PatrimonyPage
          user={user}
          accounts={accounts}
          assets={assets}
          operations={operations}
          quotes={quotes}
          incomes={incomes}
          investmentResult={investmentResult}
          importedInvestmentPositions={importedInvestmentPositions}
          importedInvestmentTransactions={importedInvestmentTransactions}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}

      {section === 'reports' && (
        <ReportsPage
          user={user}
          transactions={transactions}
          assets={assets}
          operations={operations}
          quotes={quotes}
          incomes={incomes}
        />
      )}
    </div>
  )
}
