import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { detectPlatform, isDramoraApp } from './install'
import { startSpatialNav } from './lib/spatialNav'
import { StatusProvider } from './status'
import './index.css'

const platform = detectPlatform()
if (platform === 'tv') document.documentElement.classList.add('tv')
if (platform === 'tv' || isDramoraApp()) startSpatialNav()

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is optional; the app works without a registered worker.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StatusProvider>
        <App />
      </StatusProvider>
    </BrowserRouter>
  </StrictMode>,
)
