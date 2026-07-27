import { useEffect, useState } from 'react'
import DashboardPage from './DashboardPage'
import PatrimonyPage from './PatrimonyPage'
import ReportsPage from './ReportsPage'

const SECTIONS = [
  ['overview', 'Visão financeira'],
  ['patrimony', 'Patrimônio'],
  ['reports', 'Exportar'],
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
  const [section, setSection] = useState(requestedSection || 'overview')

  useEffect(() => {
    if (requestedSection) setSection(requestedSection)
  }, [requestedSection])

  return (
    <div className="page-stack">
      <section className="analytics-heading">
        <div>
          <span className="eyebrow">Central de análises</span>
          <h2>Detalhes financeiros em formato de BI</h2>
          <p>Use filtros, comparações e relatórios sem poluir a navegação principal.</p>
        </div>

        <nav className="sub-nav analytics-nav" aria-label="Seções de análises">
          {SECTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={section === value ? 'active' : ''}
              onClick={() => setSection(value)}
            >
              {label}
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
