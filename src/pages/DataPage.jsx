import { useEffect, useState } from 'react'
import ImportPage from './ImportPage'
import OpenFinancePage from './OpenFinancePage'

const OPTIONS = [
  {
    value: 'import',
    title: 'Importar extrato',
    description: 'Envie CSV de bancos e carteiras para revisar antes de gravar.',
    action: 'Abrir importação',
  },
  {
    value: 'openfinance',
    title: 'Open Finance',
    description: 'Atualize manualmente contas, cartões, faturas e investimentos.',
    action: 'Abrir conexão',
  },
]

export default function DataPage({
  requestedSection,
  user,
  accounts,
  categories,
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState(requestedSection || 'menu')

  useEffect(() => {
    if (requestedSection) setSection(requestedSection)
  }, [requestedSection])

  if (section === 'import') {
    return (
      <div className="page-stack">
        <button type="button" className="back-button" onClick={() => setSection('menu')}>
          ← Voltar para dados
        </button>
        <ImportPage
          user={user}
          accounts={accounts}
          categories={categories}
          onChanged={onChanged}
          setFeedback={setFeedback}
        />
      </div>
    )
  }

  if (section === 'openfinance') {
    return (
      <div className="page-stack">
        <button type="button" className="back-button" onClick={() => setSection('menu')}>
          ← Voltar para dados
        </button>
        <OpenFinancePage setFeedback={setFeedback} onChanged={onChanged} />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <section className="section-intro">
        <span className="eyebrow">Entrada de dados</span>
        <h2>Como deseja atualizar o sistema?</h2>
        <p>Escolha uma das duas formas principais. Nenhuma integração automática foi ativada.</p>
      </section>

      <section className="workspace-choice-grid">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="workspace-choice"
            onClick={() => setSection(option.value)}
          >
            <span className="choice-marker" aria-hidden="true" />
            <strong>{option.title}</strong>
            <span>{option.description}</span>
            <small>{option.action} →</small>
          </button>
        ))}
      </section>
    </div>
  )
}
