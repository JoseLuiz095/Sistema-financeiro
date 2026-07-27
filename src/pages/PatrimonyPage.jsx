import { useState } from 'react'
import AccountsPage from './AccountsPage'
import InvestmentsPage from './InvestmentsPage'

const SECTIONS = [
  ['investments', 'Investimentos'],
  ['accounts', 'Contas'],
]

export default function PatrimonyPage({
  user,
  accounts,
  assets,
  operations,
  quotes,
  incomes,
  investmentResult,
  importedInvestmentPositions,
  importedInvestmentTransactions,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState('investments')

  return (
    <div className="page-stack">
      <nav className="sub-nav" aria-label="Seções de patrimônio">
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

      {section === 'investments' && (
        <InvestmentsPage
          user={user}
          accounts={accounts}
          assets={assets}
          operations={operations}
          quotes={quotes}
          incomes={incomes}
          investmentResult={investmentResult}
          importedPositions={importedInvestmentPositions}
          importedTransactions={importedInvestmentTransactions}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}

      {section === 'accounts' && (
        <AccountsPage
          user={user}
          accounts={accounts}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}
    </div>
  )
}
