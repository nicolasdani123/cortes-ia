import { KeyRound } from 'lucide-react'
import { Link } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useHasApiKey } from '@/stores/config'

/** Aviso exibido enquanto a chave do Groq não estiver configurada. */
export function ApiKeyAlert() {
  const hasApiKey = useHasApiKey()
  if (hasApiKey) return null

  return (
    <Alert className="border-primary/40">
      <KeyRound />
      <AlertTitle>Configure sua chave do Groq</AlertTitle>
      <AlertDescription>
        <p>
          Sem a chave não é possível criar projetos.{' '}
          <Link to="/config" className="font-medium text-primary underline underline-offset-4">
            Ir para Configurações
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  )
}
