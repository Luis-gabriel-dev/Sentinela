import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './lib/theme'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    // Dados locais: não há por que refazer consultas ao focar a janela.
    queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false }
  }
})

// No Electron, trocar de janela (Alt+Tab, leitor separado) não muda a visibilidade da página,
// que é o que o React Query observa por padrão. Usa também o foco da janela.
focusManager.setEventListener((setFocused) => {
  const onFocus = (): void => setFocused(true)
  const onBlur = (): void => setFocused(false)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <HashRouter>
            <App />
          </HashRouter>
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
