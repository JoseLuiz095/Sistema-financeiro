import { useState } from 'react'
import FutureTransactionsPage from './FutureTransactionsPage'
import ImportPage from './ImportPage'
import TransactionsPage from './TransactionsPage'

const SECTIONS = [
  ['transactions', 'Lançamentos'],
  ['future', 'Futuros'],
  ['import', 'Importar CSV'],
]

export default function MovementsPage({
  user,
  accounts,
  categories,
  transactions,
  schedules,
  occurrences,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState('transactions')

  return (
    <div className="page-stack">
      <nav className="sub-nav" aria-label="Seções de movimentações">
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

      {section === 'transactions' && (
        <TransactionsPage
          user={user}
          accounts={accounts}
          categories={categories}
          transactions={transactions}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}

      {section === 'future' && (
        <FutureTransactionsPage
          user={user}
          accounts={accounts}
          categories={categories}
          schedules={schedules}
          occurrences={occurrences}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}

      {section === 'import' && (
        <ImportPage
          user={user}
          accounts={accounts}
          categories={categories}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}
    </div>
  )
}
