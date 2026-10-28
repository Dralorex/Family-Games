import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// GitHub Pages SPA redirect recovery (pairs with public/404.html)
const redirect = sessionStorage.getItem('fg_spa_redirect')
if (redirect) {
  sessionStorage.removeItem('fg_spa_redirect')
  const url = new URL(redirect)
  if (url.pathname.startsWith('/Family-Games')) {
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
