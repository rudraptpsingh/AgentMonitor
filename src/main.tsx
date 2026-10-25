import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AgentMonitor Fatal Render Error]:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#16171a',
          color: '#f2f2f7',
          fontFamily: '-apple-system, sans-serif',
          padding: 24,
          boxSizing: 'border-box',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 12,
            color: '#ff453a'
          }}>
            AgentMonitor Recovery Mode
          </div>
          <div style={{
            maxWidth: 600,
            fontSize: 13,
            color: '#8e8e93',
            marginBottom: 20,
            lineHeight: 1.5,
            fontFamily: 'monospace',
            background: '#1e1f24',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #33343c',
            textAlign: 'left',
            overflow: 'auto',
            maxHeight: 200
          }}>
            {this.state.error?.message || 'Unknown render exception'}
            {'\n'}
            {this.state.error?.stack}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              height: 36,
              padding: '0 20px',
              borderRadius: 6,
              border: '1px solid #32ade6',
              background: '#32ade622',
              color: '#32ade6',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Reload Dashboard
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>,
)
