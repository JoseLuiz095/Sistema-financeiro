import { useEffect, useState } from 'react'
import AppIcon from '../components/AppIcon'
import AccountsPage from './AccountsPage'
import CategoriesPage from './CategoriesPage'
import FutureTransactionsPage from './FutureTransactionsPage'
import IntegrationsPage from './IntegrationsPage'
import SecurityPage from './SecurityPage'
import TransactionsPage from './TransactionsPage'

const OPTIONS = [
  {
    value: 'transactions',
    title: 'Lançamentos manuais',
    description:
      'Inclua, revise ou exclua movimentações específicas.',
    icon: 'transactions',
  },
  {
    value: 'future',
    title: 'Lançamentos futuros',
    description:
      'Controle contas recorrentes, parcelas e previsões.',
    icon: 'future',
  },
  {
    value: 'accounts',
    title: 'Contas',
    description:
      'Cadastre contas usadas em importações e lançamentos.',
    icon: 'accounts',
  },
  {
    value: 'categories',
    title: 'Categorias',
    description:
      'Organize receitas e despesas para as análises.',
    icon: 'categories',
  },
  {
    value: 'security',
    title: 'Segurança da conta',
    description:
      'Ative o autenticador, altere a senha e encerre sessões.',
    icon: 'shield',
  },
  {
    value: 'integrations',
    title: 'Integrações avançadas',
    description:
      'Gerencie a API receptora e conexões técnicas.',
    icon: 'integrations',
  },
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
  const [section, setSection] =
    useState(requestedSection || 'menu')

  useEffect(() => {
    if (requestedSection) {
      setSection(requestedSection)
    }
  }, [requestedSection])

  if (section === 'menu') {
    return (
      <div className="page-stack more-page">
        <section className="section-intro section-intro-card">
          <div
            className="section-icon"
            aria-hidden="true"
          >
            <AppIcon name="more" size={24} />
          </div>
          <div>
            <span className="eyebrow">
              Recursos complementares
            </span>
            <h2>Mais opções</h2>
            <p>
              Funções menos utilizadas ficam agrupadas
              aqui para manter o uso diário simples.
            </p>
          </div>
        </section>

        <section className="secondary-option-grid">
          {OPTIONS.map(
            ({
              value,
              title,
              description,
              icon,
            }) => (
              <button
                key={value}
                type="button"
                className="secondary-option"
                onClick={() =>
                  setSection(value)
                }
              >
                <div
                  className="secondary-option-icon"
                  aria-hidden="true"
                >
                  <AppIcon
                    name={icon}
                    size={23}
                  />
                </div>
                <strong>{title}</strong>
                <span>{description}</span>
                <small className="choice-action">
                  Abrir
                  <AppIcon
                    name="arrow"
                    size={16}
                  />
                </small>
              </button>
            ),
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <button
        type="button"
        className="back-button action-button-with-icon"
        onClick={() => setSection('menu')}
      >
        <span aria-hidden="true">←</span>
        Voltar para mais opções
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

      {section === 'security' && (
        <SecurityPage
          user={user}
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
