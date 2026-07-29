import AppIcon from './AppIcon'
import {
  formatCurrency,
  formatPercent,
} from '../utils/format'

const RISK_PROFILES = [
  ['conservative', 'Conservador'],
  ['moderate', 'Moderado'],
  ['aggressive', 'Arrojado'],
]

function stanceTone(stance) {
  if (['AUMENTAR_GRADUALMENTE', 'MANTER'].includes(stance)) {
    return 'positive'
  }

  if (['REDUZIR_CONCENTRACAO', 'NAO_AUMENTAR'].includes(stance)) {
    return 'negative'
  }

  return 'neutral'
}

function scoreValue(value) {
  if (!Number.isFinite(Number(value))) return '-'
  return `${Number(value).toFixed(0)}/100`
}

function positiveCurrency(value) {
  if (
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0
  ) {
    return '-'
  }

  return formatCurrency(value)
}

export default function AssetAiAnalysisPanel({
  aiResult,
  loading,
  onAnalyze,
  personalValuesVisible,
  portfolioContext,
  riskProfile,
  setRiskProfile,
}) {
  const recommendation = aiResult?.analysis ?? null
  const research = aiResult?.research ?? null
  const tone = stanceTone(recommendation?.stance)

  return (
    <section className="panel asset-ai-panel">
      <div className="panel-header asset-ai-header">
        <div className="asset-ai-title">
          <span className="asset-ai-icon" aria-hidden="true">
            <AppIcon name="sparkles" size={22} />
          </span>
          <div>
            <span className="eyebrow">Pesquisa breve sob demanda</span>
            <h2>Análise da carteira com IA</h2>
            <p>
              Cruza a análise atual, dados públicos recentes e a proporção do ativo
              na sua carteira. Nenhum resultado desta pesquisa é gravado no banco.
            </p>
          </div>
        </div>

        <div className="asset-ai-actions">
          <label>
            Perfil usado
            <select
              value={riskProfile}
              onChange={(event) => setRiskProfile(event.target.value)}
              disabled={loading}
            >
              {RISK_PROFILES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="primary-button asset-ai-button"
            onClick={onAnalyze}
            disabled={loading || !personalValuesVisible}
            title={
              personalValuesVisible
                ? 'Pesquisar fontes e gerar análise personalizada'
                : 'Mostre os valores pessoais para liberar a análise personalizada'
            }
          >
            <AppIcon name="sparkles" size={18} />
            <span>{loading ? 'Analisando...' : 'Analisar com IA'}</span>
          </button>
        </div>
      </div>

      <div className="asset-ai-portfolio-strip">
        <div>
          <span>Peso deste ativo</span>
          <strong className="personal-private-value">
            {personalValuesVisible
              ? formatPercent(portfolioContext?.selectedWeightPercent ?? 0)
              : '••••••'}
          </strong>
        </div>
        <div>
          <span>Valor considerado</span>
          <strong className="personal-private-value">
            {personalValuesVisible
              ? formatCurrency(portfolioContext?.selectedMarketValue ?? 0)
              : '••••••'}
          </strong>
        </div>
        <div>
          <span>Ativos com saldo</span>
          <strong className="personal-private-value">
            {personalValuesVisible
              ? Number(portfolioContext?.holdingCount ?? 0)
              : '••••••'}
          </strong>
        </div>
        <div>
          <span>Situação na carteira</span>
          <strong>
            {portfolioContext?.hasPosition ? 'Já possui posição' : 'Sem posição atual'}
          </strong>
        </div>
      </div>

      {!personalValuesVisible && (
        <div className="info-callout asset-ai-privacy-warning">
          A recomendação personalizada permanece bloqueada enquanto os valores
          pessoais estiverem ocultos, evitando vazamento da proporção da carteira.
        </div>
      )}

      {!recommendation && personalValuesVisible && !loading && (
        <div className="asset-ai-empty">
          <strong>A IA ainda não foi consultada para este ativo.</strong>
          <p>
            O botão executa uma pesquisa curta em tempo real e envia somente um
            resumo da carteira, sem transmitir todos os registros financeiros.
          </p>
        </div>
      )}

      {loading && (
        <div className="asset-ai-loading">
          <span className="asset-ai-loading-dot" />
          Consultando mercado, cenário macroeconômico e notícias recentes...
        </div>
      )}

      {recommendation && personalValuesVisible && !loading && (
        <div className="asset-ai-result">
          <div className={`asset-ai-recommendation asset-ai-${tone}`}>
            <div>
              <span>Leitura de adequação</span>
              <strong>{recommendation.stanceLabel}</strong>
              <p>{recommendation.headline}</p>
            </div>
            <div className="asset-ai-confidence">
              <span>Confiança</span>
              <strong>{scoreValue(recommendation.confidence)}</strong>
            </div>
          </div>

          <p className="asset-ai-summary">{recommendation.summary}</p>

          <div className="asset-ai-score-grid">
            <div><span>Qualidade</span><strong>{scoreValue(recommendation.scores?.quality)}</strong></div>
            <div><span>Valuation</span><strong>{scoreValue(recommendation.scores?.valuation)}</strong></div>
            <div><span>Momentum</span><strong>{scoreValue(recommendation.scores?.momentum)}</strong></div>
            <div><span>Risco</span><strong>{scoreValue(recommendation.scores?.risk)}</strong></div>
          </div>

          {research && (
            <div className="asset-ai-research-grid">
              <div>
                <span>Cotação externa</span>
                <strong>{positiveCurrency(research.market?.price)}</strong>
              </div>
              <div>
                <span>Selic anual</span>
                <strong>
                  {Number.isFinite(Number(research.macro?.selicAnnualPercent))
                    ? formatPercent(research.macro.selicAnnualPercent)
                    : '-'}
                </strong>
              </div>
              <div>
                <span>IPCA em 12 meses</span>
                <strong>
                  {Number.isFinite(Number(research.macro?.ipca12MonthsPercent))
                    ? formatPercent(research.macro.ipca12MonthsPercent)
                    : '-'}
                </strong>
              </div>
              <div>
                <span>Cobertura dos dados</span>
                <strong>
                  {Number.isFinite(Number(research.coverage?.percent))
                    ? `${Number(research.coverage.percent).toFixed(0)}% · ${research.coverage.grade}`
                    : '-'}
                </strong>
              </div>
            </div>
          )}

          {research?.coverage && !research.coverage.recommendationAllowed && (
            <div className="info-callout asset-ai-data-warning">
              A cobertura atual não permite uma indicação favorável. A IA foi
              bloqueada de sugerir aumento de posição e retornou apenas uma
              orientação de espera e conferência das fontes.
            </div>
          )}

          {research?.coverage?.missingFields?.length > 0 && (
            <details className="asset-ai-sources">
              <summary>
                Campos que ainda precisam de uma fonte válida ({research.coverage.missingFields.length})
              </summary>
              <ul>
                {research.coverage.missingFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="asset-ai-columns">
            <article>
              <h3>Pontos favoráveis</h3>
              <ul>
                {(recommendation.strengths ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <h3>Riscos principais</h3>
              <ul>
                {(recommendation.risks ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>

          <article className="asset-ai-portfolio-assessment">
            <h3>Impacto na sua carteira</h3>
            <p>{recommendation.portfolioAssessment?.assessment}</p>
            <div>
              <span>Concentração classificada como</span>
              <strong>{recommendation.portfolioAssessment?.concentrationLevel}</strong>
            </div>
            {Number.isFinite(
              Number(recommendation.portfolioAssessment?.suggestedMaxWeightPercent),
            ) && (
              <div>
                <span>Faixa máxima de referência sugerida</span>
                <strong>
                  {formatPercent(
                    recommendation.portfolioAssessment.suggestedMaxWeightPercent,
                  )}
                </strong>
              </div>
            )}
          </article>

          <article className="asset-ai-action-plan">
            <h3>Plano de decisão</h3>
            <ol>
              {(recommendation.actionPlan ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>

          {research?.news?.length > 0 && (
            <details className="asset-ai-news-research">
              <summary>Notícias usadas apenas como contexto</summary>
              <div>
                {research.news.slice(0, 6).map((item) => (
                  <a
                    key={`${item.title}-${item.publishedAt}`}
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {[item.source, item.publishedAt]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </a>
                ))}
              </div>
            </details>
          )}

          {research?.sources?.length > 0 && (
            <details className="asset-ai-sources">
              <summary>
                Fontes consultadas ({research.sources.filter((item) => item.status === 'ok').length}/{research.sources.length})
              </summary>
              <div>
                {research.sources.map((source) => (
                  <article key={source.id}>
                    <div>
                      <strong>{source.label}</strong>
                      <span>{source.detail}</span>
                    </div>
                    <span className={source.status === 'ok' ? 'positive' : 'negative'}>
                      {source.status === 'ok' ? 'Consultada' : 'Indisponível'}
                    </span>
                  </article>
                ))}
              </div>
            </details>
          )}

          <div className="info-callout asset-ai-disclaimer">
            {recommendation.disclaimer}
          </div>
        </div>
      )}
    </section>
  )
}
