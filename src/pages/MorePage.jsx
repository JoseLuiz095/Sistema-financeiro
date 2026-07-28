import {
  useEffect,
  useState,
} from 'react'
import AppIcon from '../components/AppIcon'
import CategoriesPage from './CategoriesPage'
import IntegrationsPage from './IntegrationsPage'
import SecurityPage from './SecurityPage'

const OPTIONS = [
  {
    value: 'categories',
    title: 'Categorias',
    description:
      'Organize as movimentações importadas para melhorar as análises.',
    icon: 'categories',
  },
  {
    value: 'security',
    title: 'Segurança da conta',
    description:
      'Gerencie autenticador, senha e sessões abertas.',
    icon: 'shield',
  },
  {
    value: 'integrations',
    title: 'Integrações avançadas',
    description:
      'Acompanhe conexões técnicas, APIs e sincronizações.',
    icon: 'integrations',
  },
]

export default function MorePage({
  requestedSection,
  user,
  accounts,
  categories,
  connections,
  syncLogs,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState(
    requestedSection || 'menu',
  )

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
            <AppIcon
              name="more"
              size={24}
            />
          </div>

          <div>
            <span className="eyebrow">
              Configurações do sistema
            </span>
            <h2>Mais opções</h2>
            <p>
              Somente configurações necessárias para
              manter as fontes e análises organizadas.
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
