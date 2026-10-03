import { useEffect } from 'react'

/** Enquanto `ativo` for true, o navegador pede confirmação antes de fechar ou recarregar a aba. */
export function useAvisoAoSair(ativo: boolean): void {
  useEffect(() => {
    if (!ativo) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Navegadores mais antigos exigem returnValue; o texto é ignorado e substituído pelo padrão.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [ativo])
}
