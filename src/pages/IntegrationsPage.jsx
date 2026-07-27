import { useMemo, useState } from 'react'
import { getConnectionStatusLabel } from '../constants/finance'
import {
  createWebhookConnection,
  deleteBankConnection,
  getWebhookEndpoint,
  rotateWebhookToken,
  sendWebhookTest,
  updateBankConnection,
} from '../services/integrationService'
import { formatDate, today } from '../utils/format'

const initialForm = {
  account_id: '',
  connection_name: '',
  institution: '',
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

export default function IntegrationsPage({
  user,
  accounts,
  connections,
  syncLogs,
  onChanged,
  setFeedback,
}) {
  const [form, setForm] = useState({ ...initialForm, account_id: accounts[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [oneTimeSecret, setOneTimeSecret] = useState(null)
  const [testing, setTesting] = useState(false)

  const endpoint = getWebhookEndpoint()
  const activeConnections = useMemo(
    () => connections.filter((connection) => connection.status === 'ACTIVE' && connection.sync_enabled),
    [connections],
  )

  async function createConnection(event) {
    event.preventDefault()
    setSaving(true)
    try {
      if (!form.account_id) throw new Error('Selecione a conta que receberá os lançamentos.')
      if (!form.connection_name.trim()) throw new Error('Informe um nome para a conexão.')

      const result = await createWebhookConnection({
        userId: user.id,
        accountId: form.account_id,
        connectionName: form.connection_name.trim(),
        institution: form.institution.trim(),
      })

      setOneTimeSecret({
        connectionId: result.connection.id,
        connectionName: result.connection.connection_name,
        token: result.token,
      })
      setForm({ ...initialForm, account_id: form.account_id })
      setFeedback({ type: 'success', message: 'Conexão criada. Guarde o token exibido agora; ele não poderá ser consultado depois.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function rotate(connection) {
    if (!window.confirm('Gerar um novo token? O token anterior deixará de funcionar imediatamente.')) return
    try {
      const result = await rotateWebhookToken(connection.id)
      setOneTimeSecret({
        connectionId: connection.id,
        connectionName: connection.connection_name,
        token: result.token,
      })
      setFeedback({ type: 'success', message: 'Token renovado. Copie o novo valor antes de sair da tela.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function toggle(connection) {
    try {
      await updateBankConnection(connection.id, {
        sync_enabled: !connection.sync_enabled,
        status: connection.sync_enabled ? 'DISABLED' : 'ACTIVE',
      })
      setFeedback({ type: 'success', message: connection.sync_enabled ? 'Conexão desativada.' : 'Conexão ativada.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function remove(connection) {
    if (!window.confirm(`Excluir a conexão "${connection.connection_name}"?`)) return
    try {
      await deleteBankConnection(connection.id)
      setFeedback({ type: 'success', message: 'Conexão excluída.' })
      if (oneTimeSecret?.connectionId === connection.id) setOneTimeSecret(null)
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback({ type: 'success', message })
    } catch {
      setFeedback({ type: 'error', message: 'Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.' })
    }
  }

  async function testWebhook() {
    if (!oneTimeSecret?.token) {
      setFeedback({ type: 'error', message: 'Gere ou renove um token para executar o teste.' })
      return
    }
    setTesting(true)
    try {
      const result = await sendWebhookTest({
        token: oneTimeSecret.token,
        transaction: {
          external_id: `test-${Date.now()}`,
          date: today(),
          description: 'Teste automático da integração',
          counterparty: 'Sistema financeiro',
          type: 'INCOME',
          amount: 0.01,
          category_name: 'Renda extra',
          source: 'WEBHOOK_TEST',
        },
      })
      setFeedback({
        type: 'success',
        message: `Integração testada: ${result.imported ?? 0} registro importado e ${result.skipped ?? 0} ignorado.`,
      })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setTesting(false)
    }
  }

  const curlExample = oneTimeSecret ? `curl --request POST '${endpoint}' \\
  --header 'Content-Type: application/json' \\
  --header 'x-connection-token: ${oneTimeSecret.token}' \\
  --data '{
    "transactions": [
      {
        "external_id": "movimento-123",
        "date": "${today()}",
        "time": "10:30:00",
        "description": "PIX recebido",
        "counterparty": "Cliente exemplo",
        "type": "INCOME",
        "amount": 150.00,
        "category_name": "Renda extra"
      }
    ]
  }'` : ''

  return (
    <div className="page-stack">
      <section className="summary-grid summary-grid-4">
        <article className="summary-card"><span>Conexões cadastradas</span><strong>{connections.length}</strong></article>
        <article className="summary-card"><span>Conexões ativas</span><strong>{activeConnections.length}</strong></article>
        <article className="summary-card"><span>Sincronizações registradas</span><strong>{syncLogs.length}</strong></article>
        <article className="summary-card"><span>Última sincronização</span><strong className="summary-date">{syncLogs[0]?.started_at ? formatDateTime(syncLogs[0].started_at) : '-'}</strong></article>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Nova integração por API</h2>
            <p>Crie um endpoint seguro para receber movimentações normalizadas de um agregador, n8n, Make ou outro serviço.</p>
          </div>

          <form className="form" onSubmit={createConnection}>
            <label>Conta de destino
              <select value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })} required>
                <option value="">Selecione</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} - {account.account_name}</option>)}
              </select>
            </label>
            <label>Nome da conexão
              <input value={form.connection_name} onChange={(event) => setForm({ ...form, connection_name: event.target.value })} placeholder="Ex.: Open Finance Inter" required />
            </label>
            <label>Instituição
              <input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} placeholder="Ex.: Inter, PicPay ou Sicoob" />
            </label>
            <div className="info-callout">
              Esta conexão não consulta o banco sozinha. Ela recebe dados de uma fonte externa autorizada. Para Open Finance em produção, será necessário contratar ou homologar um agregador compatível.
            </div>
            <button className="primary-button" disabled={saving || accounts.length === 0}>{saving ? 'Criando...' : 'Criar endpoint e token'}</button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Automação disponível agora</h2>
            <p>O sistema já fica preparado para receber dados sem abrir a tela de importação.</p>
          </div>
          <div className="automation-flow">
            <div className="flow-step"><strong>1</strong><span>Banco ou agregador</span></div>
            <div className="flow-arrow">→</div>
            <div className="flow-step"><strong>2</strong><span>Webhook Supabase</span></div>
            <div className="flow-arrow">→</div>
            <div className="flow-step"><strong>3</strong><span>Validação e deduplicação</span></div>
            <div className="flow-arrow">→</div>
            <div className="flow-step"><strong>4</strong><span>Painel atualizado</span></div>
          </div>
          <ul className="plain-list">
            <li>Token individual por conexão.</li>
            <li>Deduplicação por identificador externo ou conteúdo.</li>
            <li>Registro de sucesso, aviso e erro.</li>
            <li>Classificação por tipo e categoria recebidos.</li>
            <li>Compatível com integrações futuras de Open Finance.</li>
          </ul>
        </section>
      </div>

      {oneTimeSecret && (
        <section className="panel secret-panel">
          <div className="panel-header">
            <h2>Credencial exibida uma única vez</h2>
            <p>Conexão: {oneTimeSecret.connectionName}. Guarde o token em um cofre de senhas ou na configuração secreta da ferramenta de integração.</p>
          </div>
          <div className="credential-grid">
            <div>
              <label className="code-label">Endpoint</label>
              <div className="code-row"><code>{endpoint}</code><button type="button" className="secondary-button compact-button" onClick={() => copyText(endpoint, 'Endpoint copiado.')}>Copiar</button></div>
            </div>
            <div>
              <label className="code-label">Token</label>
              <div className="code-row"><code>{oneTimeSecret.token}</code><button type="button" className="secondary-button compact-button" onClick={() => copyText(oneTimeSecret.token, 'Token copiado.')}>Copiar</button></div>
            </div>
          </div>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={testWebhook} disabled={testing}>{testing ? 'Testando...' : 'Enviar lançamento de teste de R$ 0,01'}</button>
            <button type="button" className="secondary-button" onClick={() => copyText(curlExample, 'Exemplo cURL copiado.')}>Copiar exemplo cURL</button>
            <button type="button" className="secondary-button" onClick={() => setOneTimeSecret(null)}>Ocultar credencial</button>
          </div>
          <pre className="code-block"><code>{curlExample}</code></pre>
        </section>
      )}

      <section className="panel">
        <div className="panel-header"><h2>Conexões</h2><p>Controle as entradas automáticas vinculadas às suas contas.</p></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Conexão</th><th>Conta</th><th>Provedor</th><th>Status</th><th>Última sincronização</th><th></th></tr></thead>
            <tbody>
              {connections.length === 0 ? <tr><td colSpan="6" className="empty-cell">Nenhuma conexão cadastrada.</td></tr> : connections.map((connection) => (
                <tr key={connection.id}>
                  <td><strong>{connection.connection_name}</strong><small>{connection.institution || '-'}</small></td>
                  <td>{connection.financial_accounts?.institution}<small>{connection.financial_accounts?.account_name}</small></td>
                  <td>{connection.provider === 'CUSTOM_WEBHOOK' ? 'Webhook próprio' : connection.provider}</td>
                  <td><span className={`status-badge ${connection.sync_enabled ? 'active' : 'disabled'}`}>{getConnectionStatusLabel(connection.status)}</span></td>
                  <td>{formatDateTime(connection.last_sync_at)}</td>
                  <td>
                    <div className="inline-actions no-wrap">
                      <button type="button" className="primary-link" onClick={() => rotate(connection)}>Novo token</button>
                      <button type="button" className="secondary-link" onClick={() => toggle(connection)}>{connection.sync_enabled ? 'Desativar' : 'Ativar'}</button>
                      <button type="button" className="danger-link" onClick={() => remove(connection)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Histórico de sincronizações</h2></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Data</th><th>Conexão</th><th>Status</th><th>Importados</th><th>Ignorados</th><th>Detalhe</th></tr></thead>
            <tbody>
              {syncLogs.length === 0 ? <tr><td colSpan="6" className="empty-cell">Nenhuma sincronização registrada.</td></tr> : syncLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.started_at)}</td>
                  <td>{log.bank_connections?.connection_name || '-'}</td>
                  <td><span className={`status-badge status-${String(log.status).toLowerCase()}`}>{log.status}</span></td>
                  <td>{log.imported_records}</td>
                  <td>{log.skipped_records}</td>
                  <td>{log.error_message || log.details?.message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
