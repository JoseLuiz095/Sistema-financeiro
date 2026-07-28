import fs from 'node:fs'

const target = 'src/pages/AnalyticsPage.jsx'

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo nao encontrado: ${target}`)
}

let source = fs.readFileSync(target, 'utf8')

const importLine = "import AssetAnalysisPage from './AssetAnalysisPage'"

if (!source.includes(importLine)) {
  const anchor = "import AppIcon from '../components/AppIcon'"

  if (!source.includes(anchor)) {
    throw new Error('Import de AppIcon nao encontrado em AnalyticsPage.jsx.')
  }

  source = source.replace(anchor, `${anchor}\n${importLine}`)
}

if (!source.includes("value: 'assets'")) {
  const overviewPattern = /(\{\s*value:\s*'overview'[^\n]*\n)/

  if (!overviewPattern.test(source)) {
    throw new Error('Secao overview nao encontrada em AnalyticsPage.jsx.')
  }

  source = source.replace(
    overviewPattern,
    `$1  { value: 'assets', label: 'Analise de ativos', icon: 'trend' },\n`,
  )
}

if (!source.includes("section === 'assets'")) {
  const debtAnchor = "      {section === 'debts' && ("

  if (!source.includes(debtAnchor)) {
    throw new Error('Bloco de dividas nao encontrado em AnalyticsPage.jsx.')
  }

  const block = `      {section === 'assets' && (
        <AssetAnalysisPage
          user={user}
          assets={assets}
          importedPositions={importedInvestmentPositions}
          setFeedback={setFeedback}
        />
      )}

`

  source = source.replace(debtAnchor, `${block}${debtAnchor}`)
}

fs.writeFileSync(target, source, 'utf8')
console.log('AnalyticsPage.jsx atualizado com a secao Analise de ativos.')
