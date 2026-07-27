import { useState } from 'react'
import CategoriesPage from './CategoriesPage'
import IntegrationsPage from './IntegrationsPage'

const SECTIONS = [
  ['categories', 'Categorias'],
  ['integrations', 'Integrações API'],
]

export default function SettingsPage({
  user,
  accounts,
  categories,
  connections,
  syncLogs,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState('categories')

  return (
    <div className="page-stack">
      <nav className="sub-nav" aria-label="Seções de configurações">
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
