import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { marcarMensagensInterrompidas } from './chat/enviarMensagem'
import { marcarCortesInterrompidos } from './pipeline/renderizarCorte'
import { marcarInterrompidos } from './pipeline/runner'

// Roda antes de renderizar para a interface já abrir com o status correto.
await Promise.all([marcarInterrompidos(), marcarMensagensInterrompidas(), marcarCortesInterrompidos()]).catch((error: unknown) =>
  console.error(error),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
