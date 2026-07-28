import fs from 'node:fs'

const appPath = 'src/App.jsx'
const iconPath = 'src/components/AppIcon.jsx'
const cssPath = 'src/App.css'
const openFinancePath = 'src/pages/OpenFinancePage.jsx'

for (const filePath of [appPath, iconPath, cssPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Arquivo não encontrado: ${filePath}. Execute na raiz do projeto.`,
    )
  }
}

let app = fs.readFileSync(appPath, 'utf8')
let icons = fs.readFileSync(iconPath, 'utf8')
let css = fs.readFileSync(cssPath, 'utf8')

const privacyImport =
  "import usePersonalValuesVisibility, { setPersonalValuesVisibility } from './hooks/usePersonalValuesVisibility'"

if (!app.includes(privacyImport)) {
  const preferredAnchor =
    "import useIdleSessionGuard from './hooks/useIdleSessionGuard'"
  const fallbackAnchor =
    "import { supabase } from './lib/supabase'"
  const anchor = app.includes(preferredAnchor)
    ? preferredAnchor
    : fallbackAnchor

  if (app.includes(anchor)) {
    app = app.replace(
      anchor,
      `${anchor}\n${privacyImport}`,
    )
  } else {
    app = `${privacyImport}\n${app}`
  }
}

if (!app.includes('const personalValuesVisible')) {
  const anchor =
    '  const user = session?.user ?? null'

  if (!app.includes(anchor)) {
    throw new Error(
      'Declaração de user não encontrada em App.jsx.',
    )
  }

  app = app.replace(
    anchor,
    `${anchor}\n  const personalValuesVisible =\n    usePersonalValuesVisibility()`,
  )
}

app = app.replace(
  '<main className="app-page">',
  `<main\n      className="app-page"\n      data-personal-values-hidden={\n        personalValuesVisible\n          ? 'false'\n          : 'true'\n      }\n    >`,
)

if (!app.includes('Ocultar valores pessoais')) {
  const logoutAnchor = `          <button
            className="secondary-button header-action-button"
            type="button"
            onClick={logout}
            aria-label="Sair do sistema"`

  if (!app.includes(logoutAnchor)) {
    throw new Error(
      'Botão Sair não encontrado em App.jsx.',
    )
  }

  const privacyButton = `          <button
            className="secondary-button header-action-button privacy-header-button"
            type="button"
            onClick={() =>
              setPersonalValuesVisibility(
                !personalValuesVisible,
              )
            }
            aria-pressed={!personalValuesVisible}
            aria-label={
              personalValuesVisible
                ? 'Ocultar valores pessoais'
                : 'Mostrar valores pessoais'
            }
            title={
              personalValuesVisible
                ? 'Ocultar saldos, investimentos e movimentações pessoais'
                : 'Mostrar saldos, investimentos e movimentações pessoais'
            }
          >
            <AppIcon
              name={
                personalValuesVisible
                  ? 'eye'
                  : 'eyeOff'
              }
              size={18}
            />
            <span>
              {personalValuesVisible
                ? 'Ocultar valores'
                : 'Mostrar valores'}
            </span>
          </button>

`

  app = app.replace(
    logoutAnchor,
    `${privacyButton}${logoutAnchor}`,
  )
}

if (!icons.includes('eye: (')) {
  const anchor =
    '  arrow: <path d="m9 18 6-6-6-6" />,'

  if (!icons.includes(anchor)) {
    throw new Error(
      'Ponto de inclusão de ícones não encontrado em AppIcon.jsx.',
    )
  }

  const eyeIcons = `  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3.2 7.7C2.7 8.3 2.5 8.8 2.5 8.8S6 15 12 15c1.1 0 2.1-.2 3-.5" />
      <path d="M9.2 4.3c.9-.2 1.8-.3 2.8-.3 6 0 9.5 6 9.5 6s-.9 1.6-2.6 3" />
      <path d="m3 3 18 18" />
      <path d="M10.2 10.2a2.8 2.8 0 0 0 3.6 3.6" />
    </>
  ),
`

  icons = icons.replace(
    anchor,
    `${eyeIcons}${anchor}`,
  )
}

if (!css.includes('/* Etapa 16: privacidade global */')) {
  css += `

/* Etapa 16: privacidade global */
.privacy-header-button {
  min-width: 148px;
}

.personal-private-value {
  position: relative;
}

.app-page[data-personal-values-hidden='true']
.personal-private-value {
  color: transparent !important;
  font-size: 0 !important;
  text-shadow: none !important;
  user-select: none;
}

.app-page[data-personal-values-hidden='true']
.personal-private-value::after {
  content: '••••••';
  color: #334155;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.app-page[data-personal-values-hidden='true']
.personal-private-value small {
  display: none !important;
}

.app-page[data-personal-values-hidden='true']
.personal-private-input {
  -webkit-text-security: disc;
  color: transparent;
  text-shadow: 0 0 0 #111827;
}

.personal-private-chart {
  position: relative;
}

.app-page[data-personal-values-hidden='true']
.personal-private-chart > * {
  visibility: hidden;
}

.app-page[data-personal-values-hidden='true']
.personal-private-chart::after {
  content: 'Valores pessoais ocultos';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #52627a;
  background: #f4f7fb;
  font-weight: 800;
}

/* Open Finance: oculta somente valores monetários pessoais. */
.app-page[data-personal-values-hidden='true']
.open-finance-card-grid-extended > div:nth-child(4) strong,
.app-page[data-personal-values-hidden='true']
.open-finance-card + * .summary-card:nth-child(9) strong,
.app-page[data-personal-values-hidden='true']
.open-finance-card + * .summary-card:nth-child(10) strong {
  color: transparent !important;
  font-size: 0 !important;
}

.app-page[data-personal-values-hidden='true']
.open-finance-card-grid-extended > div:nth-child(4) strong::after,
.app-page[data-personal-values-hidden='true']
.open-finance-card + * .summary-card:nth-child(9) strong::after,
.app-page[data-personal-values-hidden='true']
.open-finance-card + * .summary-card:nth-child(10) strong::after {
  content: '••••••';
  color: #334155;
  font-size: 16px;
}

/* Dívidas e crédito são informações pessoais. */
.app-page[data-personal-values-hidden='true']
.debts-page .summary-card strong,
.app-page[data-personal-values-hidden='true']
.debt-institution-total,
.app-page[data-personal-values-hidden='true']
.debt-breakdown-grid strong,
.app-page[data-personal-values-hidden='true']
.debt-month-header span,
.app-page[data-personal-values-hidden='true']
.debt-month-lines strong,
.app-page[data-personal-values-hidden='true']
.debt-contract-values strong,
.app-page[data-personal-values-hidden='true']
.debt-list-value strong {
  color: transparent !important;
  font-size: 0 !important;
  user-select: none;
}

.app-page[data-personal-values-hidden='true']
.debts-page .summary-card strong::after,
.app-page[data-personal-values-hidden='true']
.debt-institution-total::after,
.app-page[data-personal-values-hidden='true']
.debt-breakdown-grid strong::after,
.app-page[data-personal-values-hidden='true']
.debt-month-header span::after,
.app-page[data-personal-values-hidden='true']
.debt-month-lines strong::after,
.app-page[data-personal-values-hidden='true']
.debt-contract-values strong::after,
.app-page[data-personal-values-hidden='true']
.debt-list-value strong::after {
  content: '••••••';
  color: #334155;
  font-size: 15px;
}

@media (max-width: 760px) {
  .privacy-header-button {
    min-width: 44px;
  }

  .privacy-header-button span {
    display: none;
  }
}
`
}


if (fs.existsSync(openFinancePath)) {
  let openFinance = fs.readFileSync(
    openFinancePath,
    'utf8',
  )

  const replacements = [
    [
      '<div><span>Saldo investido</span><strong>{formatCurrency(positionBalance)}</strong></div>',
      '<div><span>Saldo investido</span><strong className="personal-private-value">{formatCurrency(positionBalance)}</strong></div>',
    ],
    [
      '<article className="summary-card"><span>Saldo de investimentos recebido</span><strong>{formatCurrency(lastResult.investment_diagnostics?.net_balance_total ?? 0)}</strong></article>',
      '<article className="summary-card"><span>Saldo de investimentos recebido</span><strong className="personal-private-value">{formatCurrency(lastResult.investment_diagnostics?.net_balance_total ?? 0)}</strong></article>',
    ],
    [
      '<article className="summary-card"><span>Valor bruto recebido</span><strong>{formatCurrency(lastResult.investment_diagnostics?.gross_amount_total ?? 0)}</strong></article>',
      '<article className="summary-card"><span>Valor bruto recebido</span><strong className="personal-private-value">{formatCurrency(lastResult.investment_diagnostics?.gross_amount_total ?? 0)}</strong></article>',
    ],
    [
      '<td>{formatCurrency(bill.total_amount, bill.currency || \'BRL\')}</td>',
      '<td><span className="personal-private-value">{formatCurrency(bill.total_amount, bill.currency || \'BRL\')}</span></td>',
    ],
    [
      '<td>{formatCurrency(bill.paid_amount, bill.currency || \'BRL\')}</td>',
      '<td><span className="personal-private-value">{formatCurrency(bill.paid_amount, bill.currency || \'BRL\')}</span></td>',
    ],
    [
      '<td>{formatCurrency(transaction.amount, transaction.currency || \'BRL\')}</td>',
      '<td><span className="personal-private-value">{formatCurrency(transaction.amount, transaction.currency || \'BRL\')}</span></td>',
    ],
  ]

  for (const [before, after] of replacements) {
    if (
      openFinance.includes(before) &&
      !openFinance.includes(after)
    ) {
      openFinance = openFinance.replace(
        before,
        after,
      )
    }
  }

  fs.writeFileSync(
    openFinancePath,
    openFinance,
    'utf8',
  )
}

fs.writeFileSync(appPath, app, 'utf8')
fs.writeFileSync(iconPath, icons, 'utf8')
fs.writeFileSync(cssPath, css, 'utf8')

console.log('Etapa 16 aplicada com sucesso.')
console.log('- Botão de privacidade incluído entre Atualizar e Sair')
console.log('- Ícones de olho adicionados')
console.log('- Máscara global de valores pessoais adicionada')
console.log('- Valores monetários do Open Finance marcados como privados')
