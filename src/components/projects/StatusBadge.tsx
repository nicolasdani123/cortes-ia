import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ProjectStatus } from '@/db'
import { STATUS_LABEL, statusTom, type StatusTom } from '@/lib/status'
import { cn } from '@/lib/utils'

const TOM_CLASS: Record<StatusTom, string> = {
  neutro: 'bg-secondary text-secondary-foreground',
  processando: 'bg-primary/15 text-primary',
  sucesso: 'bg-green-500/15 text-green-400',
  erro: 'bg-destructive/20 text-destructive',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const tom = statusTom(status)
  return (
    <Badge className={cn('gap-1', TOM_CLASS[tom])}>
      {tom === 'processando' && <Loader2 className="size-3 animate-spin" />}
      {STATUS_LABEL[status]}
    </Badge>
  )
}
