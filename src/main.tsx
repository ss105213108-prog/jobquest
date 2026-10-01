import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthGateway } from './components/auth/AuthGateway'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGateway><App /></AuthGateway>
  </StrictMode>,
)
