import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { deleteProject } from '@/db'
import { cancelarProcessamento } from '@/pipeline/runner'

interface DeleteProjectButtonProps {
  projectId: string
  titulo: string
  onDeleted?: () => void
  children?: ReactNode
}

export function DeleteProjectButton({ projectId, titulo, onDeleted, children }: DeleteProjectButtonProps) {
  async function excluir() {
    try {
      cancelarProcessamento(projectId)
      await deleteProject(projectId)
      toast.success('Projeto excluído.')
      onDeleted?.()
    } catch {
      toast.error('Não foi possível excluir o projeto.')
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="icon" aria-label="Excluir projeto">
            <Trash2 />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir "{titulo}"?</AlertDialogTitle>
          <AlertDialogDescription>
            O vídeo, a transcrição e todos os cortes deste projeto serão apagados. Não dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={excluir}>
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
