import { Film, Loader2, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { useAvisoAoSair } from '@/hooks/useAvisoAoSair'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/pipeline/runner'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
  )

export function AppLayout() {
  const processando = usePipelineStore((s) => s.ativo !== null)
  useAvisoAoSair(processando)

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Film className="size-4" />
            </span>
            Corte<span className="text-primary">IA</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Projetos
            </NavLink>
            <NavLink to="/config" className={navLinkClass}>
              <Settings className="size-4" />
              <span className="hidden sm:inline">Configurações</span>
            </NavLink>
          </nav>
        </div>
      </header>
      {processando && (
        <div className="flex items-center justify-center gap-2 bg-primary px-4 py-1.5 text-center text-xs font-medium text-primary-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin" />
          Processando vídeo. Não feche nem recarregue esta aba.
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
    </div>
  )
}
