import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModeProvider } from './hooks/useMode'
import App from './App'
import './styles/globals.css'

// dragover/drop 기본 동작은 preload에서 처리

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: false,
      refetchOnWindowFocus: false
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <App />
      </ModeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
