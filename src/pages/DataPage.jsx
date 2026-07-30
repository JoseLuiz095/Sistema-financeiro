import { useEffect, useMemo, useState } from 'react'
import AppIcon from '../components/AppIcon'
import { hasPremiumDataAccess } from '../utils/openFinanceAccess'
import ImportPage from './ImportPage'
import OpenFinancePage from './OpenFinancePage'

const IMPORT_OPTION = {
  value: 'import',
  title: 'Importar extrato',
  description:
    'Envie um arquivo OFX, QFX ou CSV. O arquivo é lido no seu navegador e você revisa tudo antes de salvar.',
  action: 'Importar meu extrato',
  icon: 'upload',
  badge: 'OFX e CSV',
}

const OPEN_FINANCE_OPTION = {
  value: 'openfinance',
  title: 'Open Finance',
  description:
    'Conecte instituições e atualize contas, cartões, faturas e investimentos automaticamente.',
  action: 'Abrir conexão',
  icon: 'bank',
  badge: 'Acesso antecipado',
}

export default function DataPage({
  requestedSection,
  user,
  accounts,
  categories,
  onChanged,
  onNavigate,
  setFeedback,
}) {
  const premiumAccess = hasPremiumDataAccess(user)
  const initialSection =
    requestedSection === 'openfinance' && !premiumAccess
      ? 'import'
      : requestedSection || 'menu'
  const [section, setSection] = useState(initialSection)

  const options = useMemo(
    () =>
      premiumAccess
        ? [IMPORT_OPTION, OPEN_FINANCE_OPTION]
        : [IMPORT_OPTION],
    [premiumAccess],
  )

  useEffect(() => {
    if (!requestedSection) return

    if (requestedSection === 'openfinance' && !premiumAccess) {
      setSection('import')
      return
    }

    setSection(requestedSection)
  }, [premiumAccess, requestedSection])

  if (section === 'import') {
    return (
      <div className="page-stack">
        <button
          type="button"
          className="back-button action-button-with-icon"
          onClick={() => setSection('menu')}
        >
          <span aria-hidden="true">←</span>
          Voltar para dados
        </button>
        <ImportPage
          user={user}
          accounts={accounts}
          categories={categories}
          onChanged={onChanged}
          onNavigate={onNavigate}
          setFeedback={setFeedback}
        />
      </div>
    )
  }

  if (section === 'openfinance' && premiumAccess) {
    return (
      <div className="page-stack">
        <button
          type="button"
          className="back-button action-button-with-icon"
          onClick={() => setSection('menu')}
        >
          <span aria-hidden="true">←</span>
          Voltar para dados
        </button>
        <OpenFinancePage
          user={user}
          setFeedback={setFeedback}
          onChanged={onChanged}
        />
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
            {premiumAccess
              ? 'Importe um extrato ou use a conexão automática em acesso antecipado.'
              : 'Importe o extrato disponibilizado pelo seu banco. O processo é simples, revisável e não envia o arquivo original para o servidor.'}
          </p>
        </div>
      </section>

      <section
        className={`workspace-choice-grid ${
          premiumAccess ? '' : 'workspace-choice-grid-single'
        }`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="workspace-choice"
            onClick={() => setSection(option.value)}
          >
            <div className="workspace-choice-top">
              <div
                className="workspace-choice-icon"
                aria-hidden="true"
              >
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
          <strong>Importação com privacidade</strong>
          <span>
            O extrato é interpretado localmente. Somente as movimentações
            confirmadas são gravadas na sua conta.
          </span>
        </div>
      </section>
    </div>
  )
}
