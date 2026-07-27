import { useEffect, useState } from 'react'
import AccountsPage from './AccountsPage'
import CategoriesPage from './CategoriesPage'
import FutureTransactionsPage from './FutureTransactionsPage'
import IntegrationsPage from './IntegrationsPage'
import TransactionsPage from './TransactionsPage'

const OPTIONS = [
  ['transactions', 'Lançamentos manuais', 'Inclua, revise ou exclua movimentações específicas.'],
  ['future', 'Lançamentos futuros', 'Controle contas recorrentes, parcelas e previsões.'],
  ['accounts', 'Contas', 'Cadastre contas usadas em importações e lançamentos.'],
  ['categories', 'Categorias', 'Organize receitas e despesas para as análises.'],
  ['integrations', 'Integrações avançadas', 'Gerencie a API receptora e conexões técnicas.'],
]

export default function MorePage({
  requestedSection,
  user,
  accounts,
  categories,
  transactions,
  schedules,
  occurrences,
  connections,
  syncLogs,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState(requestedSection || 'menu')

  useEffect(() => {
    if (requestedSection) setSection(requestedSection)
  }, [requestedSection])

  if (section === 'menu') {
    return (
      <div className="page-stack">
        <section className="section-intro">
          <span className="eyebrow">Recursos complementares</span>
          <h2>Mais opções</h2>
          <p>Funções menos utilizadas ficam agrupadas aqui para manter o uso diário simples.</p>
        </section>

        <section className="secondary-option-grid">
          {OPTIONS.map(([value, title, description]) => (
            <button
              key={value}
              type="button"
              className="secondary-option"
              onClick={() => setSection(value)}
            >
              <strong>{title}</strong>
              <span>{description}</span>
              <small>Abrir →</small>
            </button>
          ))}
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <button type="button" className="back-button" onClick={() => setSection('menu')}>
        ← Voltar para mais opções
      </button>

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

      {section === 'accounts' && (
        <AccountsPage
          user={user}
          accounts={accounts}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}

      {section === 'categories' && (
        <CategoriesPage
          user={user}
          categories={categories}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}

      {section === 'integrations' && (
        <IntegrationsPage
          user={user}
          accounts={accounts}
          connections={connections}
          syncLogs={syncLogs}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      )}
    </div>
  )
}
