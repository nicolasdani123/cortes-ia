import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

interface PlaceholderPageProps {
  titulo: string
  descricao: string
}

/** Tela provisória para rotas que ainda serão implementadas nas próximas fases. */
export function PlaceholderPage({ titulo, descricao }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="text-sm text-muted-foreground">{descricao}</p>
      <Button asChild variant="outline">
        <Link to="/">Voltar para o início</Link>
      </Button>
    </div>
  )
}
