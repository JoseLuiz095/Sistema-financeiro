import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react'
import AssetAiAnalysisPanel from '../components/AssetAiAnalysisPanel'
import Feedback from '../components/Feedback'
import usePersonalValuesVisibility from '../hooks/usePersonalValuesVisibility'
import {
  deleteCostBasisAdjustment,
  getAssetAiAnalysis,
  getAssetAnalysis,
  getAssetAnalysisPreference,
  getAssetHistory,
  listCostBasisAdjustments,
  listMarketAssets,
  saveAssetAnalysisPreference,
  saveCostBasisAdjustment,
} from '../services/assetAnalysisService'
import {
  aggregateCostBasis,
  buildPortfolioContext,
  compactPortfolioContextForAi,
  calculateAdjustedPosition,
  DEFAULT_ANALYSIS_ASSUMPTIONS,
  getHealthTone,
  getTechnicalTone,
  normalizeTicker,
  percentToInput,
  safePercentInput,
} from '../utils/assetAnalysis'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  today,
} from '../utils/format'
import './asset-analysis.css'

const AssetHistoryChart = lazy(
  () => import('./AssetHistoryChart'),
)

const RANGE_OPTIONS = [
  ['1mo', '1 mes'],
  ['3mo', '3 meses'],
  ['6mo', '6 meses'],
  ['1y', '1 ano'],
  ['2y', '2 anos'],
  ['5y', '5 anos'],
  ['10y', '10 anos'],

]

const CATALOG_FILTERS = [
  ['portfolio', 'Minha carteira'],
  ['all', 'Todos'],
  ['stock', 'Ações'],
  ['fii', 'FIIs'],
  ['etf', 'ETFs'],
  ['bdr', 'BDRs'],
  ['unit', 'Units'],
]

function getCatalogType(item) {
  const subtype = String(item?.subType ?? '').toLowerCase()
  const type = String(item?.type ?? '').toLowerCase()

  if (subtype === 'fii') return 'fii'
  if (subtype === 'etf') return 'etf'
  if (subtype === 'bdr' || type === 'bdr') return 'bdr'
  if (subtype === 'unit') return 'unit'
  if (type === 'stock' || subtype === 'stock') return 'stock'
  return type || subtype || 'other'
}

function getCatalogTypeLabel(item) {
  const type = getCatalogType(item)
  const labels = {
    stock: 'Ação',
    fii: 'FII',
    etf: 'ETF',
    bdr: 'BDR',
    unit: 'Unit',
    fund: 'Fundo',
  }

  return labels[type] ?? 'Ativo B3'
}

function privateCurrency(
  value,
  currency,
  personalValuesVisible,
) {
  return personalValuesVisible
    ? currencyValue(value, currency)
    : '••••••'
}

function privateNumber(
  value,
  personalValuesVisible,
) {
  return personalValuesVisible
    ? formatNumber(value)
    : '••••••'
}

function privatePercent(
  value,
  personalValuesVisible,
) {
  return personalValuesVisible
    ? formatPercent(value)
    : '••••••'
}

function metricValue(value, type = 'number') {
  if (value == null || !Number.isFinite(Number(value))) return '-'
  if (type === 'currency') return formatCurrency(value)
  if (type === 'percent') return formatPercent(Number(value) * 100)
  if (type === 'percent-points') return formatPercent(value)
  if (type === 'multiple') return `${Number(value).toFixed(2)}x`
  return formatNumber(value)
}

function assetMetricValue(
  value,
  type,
  assetType,
  notApplicableFor = [],
) {
  if (notApplicableFor.includes(assetType)) return 'Não aplicável'
  return metricValue(value, type)
}

function currencyValue(value, currency = 'BRL') {
  if (value == null || !Number.isFinite(Number(value))) return '-'
  return formatCurrency(value, currency)
}

function positiveCurrencyValue(value, currency = 'BRL') {
  if (
    value == null ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0
  ) {
    return '-'
  }

  return formatCurrency(value, currency)
}

function positiveNumberValue(value) {
  if (
    value == null ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0
  ) {
    return '-'
  }

  return formatNumber(value)
}

function scoreLabel(score) {
  if (score == null) return 'Sem dados'
  return `${Number(score).toFixed(0)}/100`
}

function DataQuality({ analysis }) {
  const quality = analysis?.dataQuality ?? {}
  const warnings = quality.warnings ?? []

  return (
    <section className="asset-data-quality">
      {quality.externalFallbackUsed && (
        <div className="info-callout asset-external-source-warning">
          Alguns dados foram buscados fora da brapi por JSON externo experimental.
          Eles podem apresentar atraso, lacunas ou divergências em relação à bolsa,
          à corretora e a outros portais. Confira informações críticas antes da compra.
        </div>
      )}
      {quality.briefResearchExternalFallbackUsed && (
        <div className="info-callout asset-external-source-warning">
          {quality.briefResearchExternalWarning || (
            'Parte dos dados foi preenchida por fontes externas complementares. '
            + 'Essas informações podem ter atraso, metodologia diferente ou divergência '
            + 'entre provedores e, por isso, podem ser menos assertivas. Confirme os '
            + 'dados críticos antes de investir.'
          )}
          {quality.briefResearchExternalSourceLabels?.length > 0 && (
            <small>
              Fontes complementares usadas: {' '}
              {quality.briefResearchExternalSourceLabels.join(', ')}.
            </small>
          )}
        </div>
      )}
      <span>
        Fonte principal: {quality.externalFallbackUsed
          ? 'JSON externo experimental com fallback automático'
          : 'brapi'}
      </span>
      <span>
        Dados consultados em{' '}
        {quality.requestedAt
          ? new Date(quality.requestedAt).toLocaleString('pt-BR')
          : '-'}
      </span>
      <span>
        {quality.technicalObservations ?? 0} pregões na análise técnica
      </span>
      <span>
        {quality.fundamentalIndicatorsAvailable ?? 0} indicadores fundamentalistas disponíveis
      </span>
      <span>
        {quality.statementYears ?? 0} anos e {quality.statementQuarters ?? 0} trimestres disponíveis
      </span>
      <span>
        Cobertura da saúde: {Number(quality.healthCoverage ?? 0).toFixed(0)}%
      </span>
      {Number.isFinite(Number(quality.briefResearchCoverage)) && (
        <span className={Number(quality.briefResearchCoverage) >= 60 ? 'positive' : 'negative'}>
          Cobertura da pesquisa breve:{' '}
          {Number(quality.briefResearchCoverage).toFixed(0)}%
          {quality.briefResearchGrade
            ? ` · ${quality.briefResearchGrade}`
            : ''}
        </span>
      )}
      {Number.isFinite(Number(quality.briefResearchSourceReliability)) && (
        <span>
          Confiabilidade média das fontes usadas:{' '}
          {Number(quality.briefResearchSourceReliability).toFixed(0)}%
        </span>
      )}
      {quality.briefResearchExternalFields?.length > 0 && (
        <span>
          {quality.briefResearchExternalFields.length} campo(s) complementado(s)
          fora da fonte principal
        </span>
      )}
      <span className={quality.tokenConfigured ? 'positive' : 'negative'}>
        Token da fonte: {quality.tokenConfigured ? 'configurado' : 'não configurado'}
      </span>
      {quality.briefResearchMissingFields?.length > 0 && (
        <details>
          <summary>
            {quality.briefResearchMissingFields.length} campo(s) ainda sem fonte válida
          </summary>
          <ul>
            {quality.briefResearchMissingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </details>
      )}
      {warnings.length > 0 && (
        <details>
          <summary>{warnings.length} aviso(s) da fonte de dados</summary>
          <ul>
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

export default function AssetAnalysisPage({
  user,
  importedPositions = [],
  setFeedback: setGlobalFeedback,
}) {
  const [ticker, setTicker] = useState('PETR4')
  const [marketAssets, setMarketAssets] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogFilter, setCatalogFilter] = useState('portfolio')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(80)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [loadingAi, setLoadingAi] = useState(false)
  const [riskProfile, setRiskProfile] = useState('moderate')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(null)
  const [historyRange, setHistoryRange] = useState('1y')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const personalValuesVisible =
    usePersonalValuesVisibility()
  const [adjustments, setAdjustments] = useState([])
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [assumptions, setAssumptions] = useState({
    requiredReturn: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.requiredReturn),
    perpetualGrowth: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.perpetualGrowth),
    targetPe: String(DEFAULT_ANALYSIS_ASSUMPTIONS.targetPe),
    targetDividendYield: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.targetDividendYield),
    marginOfSafety: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.marginOfSafety),
  })
  const [costForm, setCostForm] = useState({
    reference_date: today(),
    quantity: '',
    average_cost: '',
    institution: 'NuInvest / Nubank',
    adjustment_type: 'CUSTODY_TRANSFER',
    notes: '',
  })

  const tickerOptions = useMemo(() => {
    const values = new Map()

    importedPositions.forEach((position) => {
      const ticker = normalizeTicker(
        position.investment_code || position.investment_name,
      )

      if (ticker && !values.has(ticker)) {
        values.set(ticker, {
          ticker,
          label: `${ticker} - ${position.investment_name || ticker}`,
        })
      }
    })

    return [...values.values()].sort((a, b) =>
      a.ticker.localeCompare(b.ticker),
    )
  }, [importedPositions])

  const portfolioTickerSet = useMemo(
    () => new Set(tickerOptions.map((item) => item.ticker)),
    [tickerOptions],
  )

  const catalogAssets = useMemo(() => {
    const values = new Map()

    marketAssets.forEach((item) => {
      const symbol = normalizeTicker(item.symbol)
      if (!symbol) return

      values.set(symbol, {
        ...item,
        symbol,
        name: item.name || symbol,
      })
    })

    tickerOptions.forEach((item) => {
      if (!values.has(item.ticker)) {
        values.set(item.ticker, {
          symbol: item.ticker,
          name: item.label.replace(`${item.ticker} - `, ''),
          type: 'stock',
          subType: 'stock',
          sector: null,
          source: 'portfolio',
        })
      }
    })

    return [...values.values()].sort((a, b) =>
      a.symbol.localeCompare(b.symbol),
    )
  }, [marketAssets, tickerOptions])

  const filteredCatalogAssets = useMemo(() => {
    const search = catalogSearch.trim().toLowerCase()

    return catalogAssets.filter((item) => {
      if (
        catalogFilter === 'portfolio' &&
        !portfolioTickerSet.has(item.symbol)
      ) {
        return false
      }

      if (
        !['portfolio', 'all'].includes(catalogFilter) &&
        getCatalogType(item) !== catalogFilter
      ) {
        return false
      }

      if (!search) return true

      return [item.symbol, item.name, item.sector, item.subsector]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(search),
        )
    })
  }, [
    catalogAssets,
    catalogFilter,
    catalogSearch,
    portfolioTickerSet,
  ])

  const selectedCatalogAsset = useMemo(
    () => catalogAssets.find((item) => item.symbol === ticker) ?? null,
    [catalogAssets, ticker],
  )

  const selectedImportedPosition = useMemo(
    () => importedPositions.find((position) =>
      normalizeTicker(position.investment_code || position.investment_name) === ticker,
    ) ?? null,
    [importedPositions, ticker],
  )

  const adjustedPosition = useMemo(
    () => calculateAdjustedPosition({
      adjustments,
      importedPosition: selectedImportedPosition,
      currentPrice: analysis?.quote?.price,
    }),
    [adjustments, selectedImportedPosition, analysis],
  )

  const costSummary = useMemo(
    () => aggregateCostBasis(adjustments),
    [adjustments],
  )

  const portfolioContext = useMemo(
    () => buildPortfolioContext({
      positions: importedPositions,
      ticker,
      adjustedPosition,
    }),
    [importedPositions, ticker, adjustedPosition],
  )

  useEffect(() => {
    if (
      catalogFilter === 'portfolio' &&
      tickerOptions.length === 0
    ) {
      setCatalogFilter('all')
    }
  }, [catalogFilter, tickerOptions.length])

  useEffect(() => {
    if (
      ticker === 'PETR4' &&
      tickerOptions.length > 0 &&
      !tickerOptions.some((item) => item.ticker === 'PETR4')
    ) {
      setTicker(tickerOptions[0].ticker)
    }
  }, [tickerOptions, ticker])

  useEffect(() => {
    let active = true

    async function loadCatalog() {
      setLoadingCatalog(true)

      try {
        const rows = await listMarketAssets()
        if (active) setMarketAssets(rows)
      } catch (error) {
        if (active) {
          setFeedback({
            type: 'error',
            message: `Falha ao carregar o catálogo da B3: ${error.message}`,
          })
        }
      } finally {
        if (active) setLoadingCatalog(false)
      }
    }

    loadCatalog()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setCatalogVisibleCount(80)
  }, [catalogFilter, catalogSearch])


  useEffect(() => {
    setAnalysis(null)
    setAiResult(null)
    setHistory(null)
    setShowHistory(false)
    loadLocalSettings(ticker)
  }, [ticker])

  async function loadLocalSettings(selectedTicker) {
    try {
      const [preference, rows] = await Promise.all([
        getAssetAnalysisPreference(selectedTicker),
        listCostBasisAdjustments(selectedTicker),
      ])

      setAdjustments(rows)

      if (preference) {
        setAssumptions({
          requiredReturn: percentToInput(preference.required_return),
          perpetualGrowth: percentToInput(preference.perpetual_growth),
          targetPe: String(preference.target_pe),
          targetDividendYield: percentToInput(preference.target_dividend_yield),
          marginOfSafety: percentToInput(preference.margin_of_safety),
        })
      } else {
        setAssumptions({
          requiredReturn: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.requiredReturn),
          perpetualGrowth: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.perpetualGrowth),
          targetPe: String(DEFAULT_ANALYSIS_ASSUMPTIONS.targetPe),
          targetDividendYield: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.targetDividendYield),
          marginOfSafety: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.marginOfSafety),
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao carregar preferencias locais: ${error.message}`,
      })
    }
  }

  function normalizedAssumptions() {
    return {
      requiredReturn: safePercentInput(assumptions.requiredReturn),
      perpetualGrowth: safePercentInput(assumptions.perpetualGrowth),
      targetPe: Number(assumptions.targetPe),
      targetDividendYield: safePercentInput(assumptions.targetDividendYield),
      marginOfSafety: safePercentInput(assumptions.marginOfSafety),
    }
  }

  async function loadAnalysis(event) {
    event?.preventDefault()
    const selectedTicker = normalizeTicker(ticker)

    if (!selectedTicker) {
      setFeedback({ type: 'error', message: 'Informe um ticker valido.' })
      return
    }

    setLoading(true)
    setAiResult(null)
    setFeedback({ type: '', message: '' })

    try {
      const result = await getAssetAnalysis(
        selectedTicker,
        normalizedAssumptions(),
        getCatalogType(selectedCatalogAsset),
      )
      setAnalysis(result)
      setGlobalFeedback?.({
        type: 'success',
        message: `Analise de ${selectedTicker} atualizada.`,
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  async function loadAiAnalysis() {
    if (!analysis) {
      setFeedback({
        type: 'error',
        message: 'Calcule a análise do ativo antes de consultar a IA.',
      })
      return
    }

    if (!personalValuesVisible) {
      setFeedback({
        type: 'error',
        message: 'Mostre os valores pessoais para liberar a análise personalizada.',
      })
      return
    }

    setLoadingAi(true)
    setFeedback({ type: '', message: '' })

    try {
      const result = await getAssetAiAnalysis({
        ticker,
        assetType:
          analysis.assetType ||
          getCatalogType(selectedCatalogAsset),
        riskProfile,
        assetSnapshot: {
          quote: analysis.quote,
          profile: analysis.profile,
          fundamentals: analysis.fundamentals,
          technical: {
            score: analysis.technical?.score,
            label: analysis.technical?.label,
            indicators: analysis.technical?.indicators,
            signals: analysis.technical?.signals,
          },
          health: {
            score: analysis.health?.score,
            label: analysis.health?.label,
            categories: (analysis.health?.categories ?? []).map((item) => ({
              label: item.label,
              score: item.score,
            })),
          },
          valuation: analysis.valuation,
          sentiment: {
            score: analysis.sentiment?.score,
            label: analysis.sentiment?.label,
            periodDays: analysis.sentiment?.periodDays,
          },
          dataQuality: analysis.dataQuality,
        },
        portfolioContext: compactPortfolioContextForAi(portfolioContext),
      })

      setAiResult(result)
      setGlobalFeedback?.({
        type: 'success',
        message: `Análise com IA de ${ticker} concluída sem gravação no banco.`,
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoadingAi(false)
    }
  }

  async function saveAssumptions() {
    const values = normalizedAssumptions()

    if (values.perpetualGrowth >= values.requiredReturn) {
      setFeedback({
        type: 'error',
        message: 'O crescimento perpetuo deve ser menor que o retorno exigido.',
      })
      return
    }

    setSaving(true)

    try {
      await saveAssetAnalysisPreference({
        user_id: user.id,
        ticker,
        required_return: values.requiredReturn,
        perpetual_growth: values.perpetualGrowth,
        target_pe: values.targetPe,
        target_dividend_yield: values.targetDividendYield,
        margin_of_safety: values.marginOfSafety,
      })
      setFeedback({
        type: 'success',
        message: 'Premissas salvas. Recalcule a analise para aplicar os novos valores.',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function loadHistory() {
    if (showHistory && history?.range === historyRange) {
      setShowHistory(false)
      return
    }

    setLoadingHistory(true)
    setFeedback({ type: '', message: '' })

    try {
      const result = await getAssetHistory(ticker, historyRange)
      setHistory(result)
      setShowHistory(true)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoadingHistory(false)
    }
  }

  async function saveCostBasis(event) {
    event.preventDefault()
    const quantity = Number(String(costForm.quantity).replace(',', '.'))
    const averageCost = Number(String(costForm.average_cost).replace(',', '.'))

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFeedback({ type: 'error', message: 'Informe uma quantidade valida.' })
      return
    }

    if (!Number.isFinite(averageCost) || averageCost < 0) {
      setFeedback({ type: 'error', message: 'Informe um custo medio valido.' })
      return
    }

    setSaving(true)

    try {
      await saveCostBasisAdjustment({
        user_id: user.id,
        ticker,
        reference_date: costForm.reference_date,
        quantity,
        average_cost: averageCost,
        institution: costForm.institution.trim() || null,
        adjustment_type: costForm.adjustment_type,
        notes: costForm.notes.trim() || null,
        active: true,
      })
      setCostForm({
        ...costForm,
        quantity: '',
        average_cost: '',
        notes: '',
      })
      await loadLocalSettings(ticker)
      setFeedback({
        type: 'success',
        message: 'Custo historico registrado sem alterar as operacoes fiscais existentes.',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function removeCostBasis(id) {
    if (!window.confirm('Excluir este ajuste de custo historico?')) return

    try {
      await deleteCostBasisAdjustment(id)
      await loadLocalSettings(ticker)
      setFeedback({ type: 'success', message: 'Ajuste removido.' })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  function selectCatalogAsset(item) {
    setTicker(item.symbol)
    setCatalogOpen(false)
    setCatalogSearch('')
    setFeedback({ type: '', message: '' })
  }

  const technicalTone = getTechnicalTone(analysis?.technical?.label)
  const healthTone = getHealthTone(analysis?.health?.score)

  return (
    <div className="page-stack asset-analysis-page">
      <section className="panel asset-search-panel">
        <div className="asset-search-heading-row">
          <div className="panel-header">
            <span className="eyebrow">Central de estudo</span>
            <h2>Analise completa de ativos</h2>
            <p>
              Cotacao, indicadores tecnicos, saude financeira, preco justo e seu custo historico.
            </p>
          </div>

        </div>

        <form className="asset-search-form asset-selector-form" onSubmit={loadAnalysis}>
          <div className="asset-selected-control">
            <span>Ativo selecionado</span>
            <button
              type="button"
              className="asset-selected-button"
              onClick={() => setCatalogOpen((current) => !current)}
              aria-expanded={catalogOpen}
              aria-controls="asset-market-catalog"
            >
              <div>
                <strong>{ticker}</strong>
                <small>
                  {selectedCatalogAsset?.name || 'Selecione um ativo da B3'}
                </small>
              </div>
              <span aria-hidden="true">⌄</span>
            </button>
          </div>

          <button className="primary-button" disabled={loading || !ticker}>
            {loading ? 'Calculando...' : 'Analisar ativo'}
          </button>
        </form>

        {catalogOpen && (
          <section className="asset-catalog" id="asset-market-catalog">
            <div className="asset-catalog-toolbar">
              <div className="asset-catalog-filters" role="tablist" aria-label="Tipos de ativos">
                {CATALOG_FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={catalogFilter === value ? 'active' : ''}
                    onClick={() => setCatalogFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="asset-catalog-search">
                <span>Busca opcional</span>
                <input
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Ticker, empresa ou setor"
                />
              </label>
            </div>

            {loadingCatalog ? (
              <div className="asset-catalog-status">Carregando todos os ativos da B3...</div>
            ) : filteredCatalogAssets.length === 0 ? (
              <div className="asset-catalog-status">
                Nenhum ativo encontrado neste filtro.
              </div>
            ) : (
              <>
                <div className="asset-catalog-grid">
                  {filteredCatalogAssets
                    .slice(0, catalogVisibleCount)
                    .map((item) => (
                      <button
                        key={item.symbol}
                        type="button"
                        className={item.symbol === ticker ? 'selected' : ''}
                        onClick={() => selectCatalogAsset(item)}
                      >
                        <div>
                          <strong>{item.symbol}</strong>
                          <span>{item.name || item.symbol}</span>
                        </div>
                        <small>
                          {getCatalogTypeLabel(item)}
                          {item.sector ? ` · ${item.sector}` : ''}
                        </small>
                      </button>
                    ))}
                </div>

                {filteredCatalogAssets.length > catalogVisibleCount && (
                  <button
                    type="button"
                    className="secondary-button asset-catalog-more"
                    onClick={() => setCatalogVisibleCount((current) => current + 80)}
                  >
                    Mostrar mais {Math.min(80, filteredCatalogAssets.length - catalogVisibleCount)} ativos
                  </button>
                )}

                <div className="asset-catalog-count">
                  Exibindo {Math.min(catalogVisibleCount, filteredCatalogAssets.length)} de{' '}
                  {filteredCatalogAssets.length} ativos.
                </div>
              </>
            )}
          </section>
        )}
      </section>

      <Feedback feedback={feedback} />

      {!analysis && (
        <section className="panel asset-empty-state">
          <strong>Selecione um ticker e clique em Analisar ativo.</strong>
          <p>
            O grafico historico nao e carregado automaticamente. Ele sera consultado apenas quando voce solicitar.
          </p>
        </section>
      )}

      {analysis && (
        <>
          <section className="panel asset-hero-card">
            <div className="asset-identity">
              {analysis.quote.logoUrl && (
                <img
                  src={analysis.quote.logoUrl}
                  alt=""
                  className="asset-logo"
                />
              )}
              <div>
                <span className="eyebrow">{analysis.profile.sector || 'B3'}</span>
                <h2>{analysis.quote.longName || ticker}</h2>
                <p>{ticker} - {analysis.profile.industry || 'Setor nao informado'}</p>
              </div>
            </div>

            <div className="asset-price-block">
              <strong>{currencyValue(analysis.quote.price, analysis.quote.currency)}</strong>
              <span
                className={
                  analysis.quote.changePercent >= 0
                    ? 'positive'
                    : 'negative'
                }
              >
                {`${currencyValue(analysis.quote.change)} (${formatPercent(analysis.quote.changePercent)})`}
              </span>
              <small>{analysis.quote.marketTime ? new Date(analysis.quote.marketTime).toLocaleString('pt-BR') : '-'}</small>
            </div>
          </section>

          <section className="summary-grid summary-grid-4">
            <article className="summary-card">
              <span>Analise tecnica</span>
              <strong className={technicalTone}>{analysis.technical.label}</strong>
              <small>{scoreLabel(analysis.technical.score)}</small>
            </article>
            <article className="summary-card">
              <span>Saude da empresa</span>
              <strong className={healthTone}>{analysis.health.label}</strong>
              <small>{scoreLabel(analysis.health.score)}</small>
            </article>
            <article className="summary-card">
              <span>Preco justo base</span>
              <strong>{currencyValue(analysis.valuation.basePrice, analysis.quote.currency)}</strong>
              <small>Confianca {Number(analysis.valuation.confidence || 0).toFixed(0)}%</small>
            </article>
            <article className="summary-card">
              <span>Comprar abaixo de</span>
              <strong>{currencyValue(analysis.valuation.buyBelow, analysis.quote.currency)}</strong>
              <small>Com margem de seguranca configurada</small>
            </article>
          </section>

          <AssetAiAnalysisPanel
            aiResult={aiResult}
            loading={loadingAi}
            onAnalyze={loadAiAnalysis}
            personalValuesVisible={personalValuesVisible}
            portfolioContext={portfolioContext}
            riskProfile={riskProfile}
            setRiskProfile={setRiskProfile}
          />

          <section className="asset-analysis-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Resumo de mercado</h2>
              </div>
              <div className="asset-metric-grid">
                <div><span>Abertura</span><strong>{positiveCurrencyValue(analysis.quote.open, analysis.quote.currency)}</strong></div>
                <div><span>Maxima do dia</span><strong>{positiveCurrencyValue(analysis.quote.dayHigh, analysis.quote.currency)}</strong></div>
                <div><span>Minima do dia</span><strong>{positiveCurrencyValue(analysis.quote.dayLow, analysis.quote.currency)}</strong></div>
                <div><span>Fechamento anterior</span><strong>{positiveCurrencyValue(analysis.quote.previousClose, analysis.quote.currency)}</strong></div>
                <div><span>Maxima 52 semanas</span><strong>{positiveCurrencyValue(analysis.quote.fiftyTwoWeekHigh, analysis.quote.currency)}</strong></div>
                <div><span>Minima 52 semanas</span><strong>{positiveCurrencyValue(analysis.quote.fiftyTwoWeekLow, analysis.quote.currency)}</strong></div>
                <div><span>Volume</span><strong>{positiveNumberValue(analysis.quote.volume)}</strong></div>
                <div><span>Valor de mercado</span><strong>{positiveCurrencyValue(analysis.quote.marketCap, analysis.quote.currency)}</strong></div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Multiplos e rentabilidade</h2>
              </div>
              <div className="asset-metric-grid">
                <div><span>P/L</span><strong>{assetMetricValue(analysis.fundamentals.trailingPe, 'multiple', analysis.assetType, ['fii', 'etf'])}</strong></div>
                <div><span>P/VP</span><strong>{assetMetricValue(analysis.fundamentals.priceToBook, 'multiple', analysis.assetType, ['etf'])}</strong></div>
                <div><span>EV/EBITDA</span><strong>{assetMetricValue(analysis.fundamentals.enterpriseToEbitda, 'multiple', analysis.assetType, ['fii', 'etf'])}</strong></div>
                <div><span>Dividend yield</span><strong>{metricValue(analysis.fundamentals.dividendYield, 'percent')}</strong></div>
                <div><span>ROE</span><strong>{assetMetricValue(analysis.fundamentals.roe, 'percent', analysis.assetType, ['fii', 'etf'])}</strong></div>
                <div><span>ROA</span><strong>{assetMetricValue(analysis.fundamentals.roa, 'percent', analysis.assetType, ['fii', 'etf'])}</strong></div>
                <div><span>Margem liquida</span><strong>{assetMetricValue(analysis.fundamentals.netMargin, 'percent', analysis.assetType, ['fii', 'etf'])}</strong></div>
                <div><span>Beta</span><strong>{metricValue(analysis.fundamentals.beta)}</strong></div>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header asset-panel-header-actions">
              <div>
                <h2>Grafico historico</h2>
                <p>Carregado apenas sob demanda para reduzir consumo de dados e processamento.</p>
              </div>
              <div className="asset-history-controls">
                <select
                  value={historyRange}
                  onChange={(event) => {
                    setHistoryRange(event.target.value)
                    setHistory(null)
                    setShowHistory(false)
                  }}
                >
                  {RANGE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={loadHistory}
                  disabled={loadingHistory}
                  title="Carregar histórico do ativo"
                >
                  {loadingHistory
                    ? 'Carregando grafico...'
                    : showHistory
                      ? 'Ocultar grafico'
                      : 'Carregar grafico'}
                </button>
              </div>
            </div>


            {showHistory &&
              history?.series?.length > 0 && (
                <Suspense fallback={<div className="asset-chart-loading">Preparando grafico...</div>}>
                  <AssetHistoryChart series={history.series} />
                </Suspense>
              )}
          </section>

          <section className="asset-analysis-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Analise tecnica</h2>
                <p>Sinal quantitativo baseado em tendencia, momentum e volatilidade.</p>
              </div>

              <div className={`asset-score-gauge asset-score-${technicalTone}`}>
                <strong>{scoreLabel(analysis.technical.score)}</strong>
                <span>{analysis.technical.label}</span>
              </div>

              <div className="asset-metric-grid">
                <div><span>RSI 14</span><strong>{metricValue(analysis.technical.indicators.rsi14)}</strong></div>
                <div><span>MACD</span><strong>{metricValue(analysis.technical.indicators.macd)}</strong></div>
                <div><span>Histograma MACD</span><strong>{metricValue(analysis.technical.indicators.macdHistogram)}</strong></div>
                <div><span>Estocastico 14</span><strong>{metricValue(analysis.technical.indicators.stochastic14)}</strong></div>
                <div><span>MM21</span><strong>{currencyValue(analysis.technical.indicators.sma21, analysis.quote.currency)}</strong></div>
                <div><span>MM50</span><strong>{currencyValue(analysis.technical.indicators.sma50, analysis.quote.currency)}</strong></div>
                <div><span>MM200</span><strong>{currencyValue(analysis.technical.indicators.sma200, analysis.quote.currency)}</strong></div>
                <div><span>ATR 14</span><strong>{currencyValue(analysis.technical.indicators.atr14, analysis.quote.currency)}</strong></div>
                <div><span>Suporte 20 pregoes</span><strong>{currencyValue(analysis.technical.indicators.support20, analysis.quote.currency)}</strong></div>
                <div><span>Resistencia 20 pregoes</span><strong>{currencyValue(analysis.technical.indicators.resistance20, analysis.quote.currency)}</strong></div>
              </div>

              <div className="asset-signal-list">
                {analysis.technical.signals.map((signal) => (
                  <div key={signal.label} className={`asset-signal asset-signal-${signal.direction.toLowerCase()}`}>
                    <strong>{signal.label}</strong>
                    <span>{signal.value}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Saude da empresa</h2>
                <p>Nota proporcional apenas aos indicadores disponiveis para o setor.</p>
              </div>

              <div className={`asset-score-gauge asset-score-${healthTone}`}>
                <strong>{scoreLabel(analysis.health.score)}</strong>
                <span>{analysis.health.label}</span>
              </div>

              <div className="asset-health-bars">
                {analysis.health.categories.map((category) => (
                  <div key={category.label} className="asset-health-row">
                    <div>
                      <span>{category.label}</span>
                      <strong>{scoreLabel(category.score)}</strong>
                    </div>
                    <progress max="100" value={category.score || 0} />
                  </div>
                ))}
              </div>

              <div className="asset-metric-grid asset-health-metric-grid">
                <div><span>ROE</span><strong>{metricValue(analysis.fundamentals.roe, 'percent')}</strong></div>
                <div><span>ROA</span><strong>{metricValue(analysis.fundamentals.roa, 'percent')}</strong></div>
                <div><span>Margem EBITDA</span><strong>{metricValue(analysis.fundamentals.ebitdaMargin, 'percent')}</strong></div>
                <div><span>Margem líquida</span><strong>{metricValue(analysis.fundamentals.netMargin, 'percent')}</strong></div>
                <div><span>Dívida / patrimônio</span><strong>{metricValue(analysis.fundamentals.debtToEquity, 'multiple')}</strong></div>
                <div><span>Dívida líquida / EBITDA</span><strong>{metricValue(analysis.fundamentals.netDebtToEbitda, 'multiple')}</strong></div>
                <div><span>Cobertura de juros</span><strong>{metricValue(analysis.fundamentals.interestCoverage, 'multiple')}</strong></div>
                <div><span>Liquidez corrente</span><strong>{metricValue(analysis.fundamentals.currentRatio)}</strong></div>
                <div><span>Liquidez seca</span><strong>{metricValue(analysis.fundamentals.quickRatio)}</strong></div>
                <div><span>Caixa / dívida</span><strong>{metricValue(analysis.fundamentals.cashToDebt, 'multiple')}</strong></div>
                <div><span>Crescimento da receita</span><strong>{metricValue(analysis.fundamentals.revenueGrowth, 'percent')}</strong></div>
                <div><span>Crescimento do lucro</span><strong>{metricValue(analysis.fundamentals.earningsGrowth, 'percent')}</strong></div>
                <div><span>CAGR receita</span><strong>{metricValue(analysis.fundamentals.revenueCagr3y, 'percent')}</strong></div>
                <div><span>CAGR lucro</span><strong>{metricValue(analysis.fundamentals.earningsCagr3y, 'percent')}</strong></div>
                <div><span>Anos com lucro positivo</span><strong>{metricValue(analysis.fundamentals.positiveProfitYears, 'percent')}</strong></div>
                <div><span>Anos com caixa livre positivo</span><strong>{metricValue(analysis.fundamentals.positiveFreeCashflowYears, 'percent')}</strong></div>
                <div><span>Fluxo de caixa livre</span><strong>{currencyValue(analysis.fundamentals.freeCashflow, analysis.quote.currency)}</strong></div>
                <div><span>Conversão de lucro em caixa</span><strong>{metricValue(analysis.fundamentals.cashConversion, 'multiple')}</strong></div>
              </div>

              <details className="asset-health-details">
                <summary>Ver critérios usados na pontuação</summary>
                {analysis.health.categories.map((category) => (
                  <section key={category.label}>
                    <h3>{category.label}</h3>
                    <div className="asset-health-detail-list">
                      {(category.details || []).map((detail) => (
                        <div key={detail.label}>
                          <span>{detail.label}</span>
                          <strong>{scoreLabel(detail.score)}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </details>
            </article>
          </section>

          <section className="panel asset-sentiment-panel">
            <div className="panel-header">
              <h2>Sentimento das notícias</h2>
              <p>
                Estimativa automática baseada em notícias públicas dos últimos
                {analysis.sentiment?.periodDays ?? 30} dias.
              </p>
            </div>

            <div className="asset-sentiment-summary">
              <div className={`asset-score-gauge asset-score-${
                Number(analysis.sentiment?.score ?? 0) >= 15
                  ? 'positive'
                  : Number(analysis.sentiment?.score ?? 0) <= -15
                    ? 'negative'
                    : 'neutral'
              }`}>
                <strong>
                  {analysis.sentiment?.score == null
                    ? 'Sem dados'
                    : `${Number(analysis.sentiment.score).toFixed(0)}/100`}
                </strong>
                <span>{analysis.sentiment?.label ?? 'Sem dados'}</span>
              </div>

              <div className="asset-metric-grid">
                <div><span>Notícias analisadas</span><strong>{analysis.sentiment?.articleCount ?? 0}</strong></div>
                <div><span>Positivas</span><strong className="positive">{analysis.sentiment?.positiveArticles ?? 0}</strong></div>
                <div><span>Neutras</span><strong>{analysis.sentiment?.neutralArticles ?? 0}</strong></div>
                <div><span>Negativas</span><strong className="negative">{analysis.sentiment?.negativeArticles ?? 0}</strong></div>
              </div>
            </div>

            {analysis.sentiment?.articles?.length > 0 && (
              <div className="asset-news-list">
                {analysis.sentiment.articles.slice(0, 6).map((article, index) => (
                  <a
                    key={`${article.url || article.title}-${index}`}
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>{article.title}</strong>
                    <span>{article.domain || 'Fonte externa'}</span>
                  </a>
                ))}
              </div>
            )}

            <div className="info-callout info-callout-secondary">
              {analysis.sentiment?.disclaimer ||
                'O sentimento é uma estimativa e não representa recomendação de compra.'}
            </div>
          </section>

          <section className="asset-analysis-grid asset-valuation-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Preco justo por modelos</h2>
                <p>O sistema combina apenas modelos com entradas validas.</p>
              </div>

              <div className="asset-valuation-range">
                <div><span>Conservador</span><strong>{currencyValue(analysis.valuation.conservativePrice, analysis.quote.currency)}</strong></div>
                <div className="asset-valuation-base"><span>Base ponderada</span><strong>{currencyValue(analysis.valuation.basePrice, analysis.quote.currency)}</strong></div>
                <div><span>Otimista</span><strong>{currencyValue(analysis.valuation.optimisticPrice, analysis.quote.currency)}</strong></div>
              </div>

              <div className="asset-model-list">
                {analysis.valuation.models.map((model) => (
                  <article key={model.id}>
                    <div>
                      <strong>{model.label}</strong>
                      <span>{model.explanation}</span>
                    </div>
                    <strong>{currencyValue(model.price, analysis.quote.currency)}</strong>
                  </article>
                ))}
              </div>

              <div className="asset-valuation-summary">
                <div><span>Preco atual</span><strong>{currencyValue(analysis.quote.price, analysis.quote.currency)}</strong></div>
                <div><span>Potencial ate o preco base</span><strong className={analysis.valuation.upsidePercent >= 0 ? 'positive' : 'negative'}>{formatPercent(analysis.valuation.upsidePercent)}</strong></div>
                <div><span>Referencia media de analistas</span><strong>{positiveCurrencyValue(analysis.valuation.analystReference.mean, analysis.quote.currency)}</strong></div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Premissas de valoracao</h2>
                <p>Ajuste por ativo. Valores mais conservadores reduzem o preco justo.</p>
              </div>

              <div className="form asset-assumptions-form">
                <div className="two-columns">
                  <label>Retorno exigido (%)<input type="number" step="0.01" min="6" max="40" value={assumptions.requiredReturn} onChange={(event) => setAssumptions({ ...assumptions, requiredReturn: event.target.value })} /></label>
                  <label>Crescimento perpetuo (%)<input type="number" step="0.01" min="0" max="15" value={assumptions.perpetualGrowth} onChange={(event) => setAssumptions({ ...assumptions, perpetualGrowth: event.target.value })} /></label>
                  <label>P/L alvo<input type="number" step="0.1" min="3" max="40" value={assumptions.targetPe} onChange={(event) => setAssumptions({ ...assumptions, targetPe: event.target.value })} /></label>
                  <label>Dividend yield alvo (%)<input type="number" step="0.01" min="1" max="30" value={assumptions.targetDividendYield} onChange={(event) => setAssumptions({ ...assumptions, targetDividendYield: event.target.value })} /></label>
                  <label>Margem de seguranca (%)<input type="number" step="0.01" min="0" max="60" value={assumptions.marginOfSafety} onChange={(event) => setAssumptions({ ...assumptions, marginOfSafety: event.target.value })} /></label>
                </div>

                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={saveAssumptions} disabled={saving}>Salvar premissas</button>
                  <button type="button" className="primary-button" onClick={loadAnalysis} disabled={loading}>Recalcular</button>
                </div>
              </div>
            </article>
          </section>

          <section className="asset-analysis-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Seu custo historico</h2>
                <p>Corrige a referencia economica depois de transferencia de custodia sem alterar notas fiscais ou operacoes antigas.</p>
              </div>

              <section className="summary-grid summary-grid-4 asset-position-summary">
                <article className="summary-card"><span>Quantidade considerada</span><strong className="personal-private-value">{privateNumber(adjustedPosition.quantity, personalValuesVisible)}</strong></article>
                <article className="summary-card"><span>Custo medio historico</span><strong className="personal-private-value">{privateCurrency(adjustedPosition.averageCost, analysis.quote.currency, personalValuesVisible)}</strong></article>
                <article className="summary-card"><span>Custo total historico</span><strong className="personal-private-value">{privateCurrency(adjustedPosition.totalCost, analysis.quote.currency, personalValuesVisible)}</strong></article>
                <article className="summary-card"><span>Resultado desde a origem</span><strong
                  className={
                    `personal-private-value ` +
                    (adjustedPosition.result >= 0
                      ? 'positive'
                      : 'negative')
                  }
                >
                  {privateCurrency(
                    adjustedPosition.result,
                    analysis.quote.currency,
                    personalValuesVisible,
                  )}
                  <small>
                    {personalValuesVisible && adjustedPosition.resultPercent != null
                      ? formatPercent(adjustedPosition.resultPercent)
                      : ''}
                  </small>
                </strong></article>
              </section>

              {!adjustedPosition.hasHistoricalCost && (
                <div className="info-callout">
                  O Open Finance pode informar a posicao atual sem o custo medio anterior a transferencia. Cadastre abaixo o custo historico da NuInvest ou da corretora de origem.
                </div>
              )}

              <div className="asset-cost-list">
                {adjustments.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong className="personal-private-value">
                        {personalValuesVisible
                          ? `${formatNumber(item.quantity)} a ${formatCurrency(item.average_cost)}`
                          : '••••••'}
                      </strong>
                      <span>{formatDate(item.reference_date)} - {item.institution || 'Origem nao informada'}</span>
                    </div>
                    <button type="button" className="danger-link" onClick={() => removeCostBasis(item.id)}>Excluir</button>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Adicionar referencia de custodia</h2>
              </div>

              <form className="form" onSubmit={saveCostBasis}>
                <div className="two-columns">
                  <label>Data-base<input type="date" value={costForm.reference_date} onChange={(event) => setCostForm({ ...costForm, reference_date: event.target.value })} required /></label>
                  <label>Tipo<select value={costForm.adjustment_type} onChange={(event) => setCostForm({ ...costForm, adjustment_type: event.target.value })}><option value="CUSTODY_TRANSFER">Transferencia de custodia</option><option value="INITIAL_POSITION">Posicao inicial</option><option value="MANUAL_CORRECTION">Correcao manual</option></select></label>
                  <label>Quantidade<input className="personal-private-input" type={personalValuesVisible ? 'text' : 'password'} inputMode="decimal" value={costForm.quantity} onChange={(event) => setCostForm({ ...costForm, quantity: event.target.value })} placeholder="100" required /></label>
                  <label>Custo medio por acao<input className="personal-private-input" type={personalValuesVisible ? 'text' : 'password'} inputMode="decimal" value={costForm.average_cost} onChange={(event) => setCostForm({ ...costForm, average_cost: event.target.value })} placeholder="32,45" required /></label>
                </div>
                <label>Instituicao de origem<input value={costForm.institution} onChange={(event) => setCostForm({ ...costForm, institution: event.target.value })} /></label>
                <label>Observacao<textarea value={costForm.notes} onChange={(event) => setCostForm({ ...costForm, notes: event.target.value })} placeholder="Ex.: custo medio anterior a transferencia para o Inter" /></label>
                <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar custo historico'}</button>
              </form>
            </article>
          </section>

          {analysis.profile.summary && (
            <section className="panel">
              <div className="panel-header"><h2>Perfil da empresa</h2></div>
              <p className="asset-company-summary">{analysis.profile.summary}</p>
            </section>
          )}

          <DataQuality analysis={analysis} />

          <section className="info-callout asset-risk-warning">
            Os calculos sao ferramentas de estudo e nao garantem retorno. Analise tecnica, preco justo e notas de saude dependem da qualidade dos dados, das premissas e do ciclo da empresa. Nao utilize um unico indicador como ordem automatica de compra.
          </section>
        </>
      )}
    </div>
  )
}
