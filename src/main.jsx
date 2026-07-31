import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[APP][RENDER_ERROR]', error, info)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#eef3f9',
          color: '#152238',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(100%, 680px)',
            padding: '24px',
            border: '1px solid #d4dfec',
            borderRadius: '18px',
            background: '#ffffff',
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: '1.35rem' }}>
            Não foi possível abrir o sistema
          </h1>
          <p>
            O navegador encontrou uma falha ao montar a interface. Atualize a página. Se o problema continuar, copie a mensagem técnica abaixo.
          </p>
          <pre
            style={{
              overflow: 'auto',
              padding: '12px',
              borderRadius: '10px',
              background: '#f3f6fa',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: '100%',
              minHeight: '46px',
              marginTop: '10px',
              border: 0,
              borderRadius: '10px',
              background: '#1765ad',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Recarregar página
          </button>
        </section>
      </main>
    )
  }
}

function renderStartupError(error) {
  console.error('[APP][STARTUP_ERROR]', error)

  const rootElement = document.getElementById('root')
  if (!rootElement) return

  rootElement.replaceChildren()

  const main = document.createElement('main')
  main.style.cssText = [
    'min-height:100dvh',
    'display:grid',
    'place-items:center',
    'padding:24px',
    'background:#eef3f9',
    'color:#152238',
    'font-family:system-ui,sans-serif',
  ].join(';')

  const card = document.createElement('section')
  card.style.cssText = [
    'width:min(100%,680px)',
    'padding:24px',
    'border:1px solid #d4dfec',
    'border-radius:18px',
    'background:#fff',
  ].join(';')

  const title = document.createElement('h1')
  title.textContent = 'Não foi possível iniciar o sistema'
  title.style.marginTop = '0'

  const message = document.createElement('p')
  message.textContent =
    'Verifique as variáveis do arquivo .env.local e a mensagem técnica abaixo.'

  const details = document.createElement('pre')
  details.textContent = String(error?.message ?? error)
  details.style.cssText = [
    'overflow:auto',
    'padding:12px',
    'border-radius:10px',
    'background:#f3f6fa',
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
  ].join(';')

  card.append(title, message, details)
  main.append(card)
  rootElement.append(main)
}

async function bootstrap() {
  try {
    const [{ default: App }] = await Promise.all([
      import('./App.jsx'),
    ])

    const rootElement = document.getElementById('root')
    if (!rootElement) {
      throw new Error('Elemento #root não foi encontrado no index.html.')
    }

    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    renderStartupError(error)
  }
}

bootstrap()
