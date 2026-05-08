import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppRouter from './router/AppRouter.jsx'
import { cleanupLocalServiceWorker } from './utils/localServiceWorkerCleanup.js'

cleanupLocalServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
