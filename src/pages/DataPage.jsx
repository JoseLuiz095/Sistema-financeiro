import { useEffect, useState } from 'react'
import AppIcon from '../components/AppIcon'
import ImportPage from './ImportPage'
import OpenFinancePage from './OpenFinancePage'

const OPTIONS = [
  {
    value: 'import',
    title: 'Importar extrato',
    description: 'Envie um arquivo CSV e revise as movimentações antes de gravar.',
    action: 'Abrir importação',
    icon: 'upload',
    badge: 'CSV',
  },
  {
    value: 'openfinance',
    title: 'Open Finance',
    description: 'Conecte instituições e atualize contas, cartões, faturas e investimentos.',
    action: 'Abrir conexão',
    icon: 'bank',
    badge: 'Conexão segura',
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
        <button type="button" className="back-button action-button-with-icon" onClick={() => setSection('menu')}>
          <span aria-hidden="true">←</span>
          Voltar para dados
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
        <button type="button" className="back-button action-button-with-icon" onClick={() => setSection('menu')}>
          <span aria-hidden="true">←</span>
          Voltar para dados
        </button>
        <OpenFinancePage setFeedback={setFeedback} onChanged={onChanged} />
      </div>
    )
  }

  return (
    <div className="page-stack data-page">
      <section className="section-intro section-intro-card">
        <div className="section-icon" aria-hidden="true">
          <AppIcon name="data" size={24} />
        </div>
        <div>
          <span className="eyebrow">Entrada de dados</span>
          <h2>Como deseja atualizar o sistema?</h2>
          <p>
            Escolha a forma mais prática. Você pode importar um extrato ou conectar uma
            instituição sem ativar sincronizações automáticas.
          </p>
        </div>
      </section>

      <section className="workspace-choice-grid">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="workspace-choice"
            onClick={() => setSection(option.value)}
          >
            <div className="workspace-choice-top">
              <div className="workspace-choice-icon" aria-hidden="true">
                <AppIcon name={option.icon} size={25} />
              </div>
              <span className="choice-badge">{option.badge}</span>
            </div>
            <strong>{option.title}</strong>
            <span>{option.description}</span>
            <small className="choice-action">
              {option.action}
              <AppIcon name="arrow" size={16} />
            </small>
          </button>
        ))}
      </section>

      <section className="privacy-strip">
        <AppIcon name="shield" size={20} />
        <div>
          <strong>Seus dados permanecem protegidos</strong>
          <span>As credenciais da Pluggy ficam nas Edge Functions, não no navegador.</span>
        </div>
      </section>
    </div>
  )
}
