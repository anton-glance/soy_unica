import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SessionProvider } from './lib/session'
import './styles/base.css'
import './styles/print.css'

const root = document.getElementById('root')
if (!root) throw new Error('Falta el contenedor #root')

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
)
