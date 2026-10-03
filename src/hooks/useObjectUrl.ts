import { useEffect, useRef, useState } from 'react'

/**
 * Cria uma URL temporária para o Blob e a libera quando `chave` muda ou o componente sai da tela.
 *
 * O Dexie devolve um objeto Blob novo a cada vez que o registro é relido (ex.: a cada atualização
 * de progresso), mesmo com o mesmo conteúdo. Por isso a URL é refeita só quando `chave` muda;
 * sem isso o player reiniciaria a cada atualização.
 */
export function useObjectUrl(blob: Blob | null | undefined, chave: string | undefined): string | null {
  const [entry, setEntry] = useState<{ chave: string; url: string } | null>(null)
  const blobRef = useRef(blob)
  const temBlob = blob != null

  // Declarado antes do effect abaixo, então roda antes dele no mesmo commit.
  useEffect(() => {
    blobRef.current = blob
  })

  useEffect(() => {
    const atual = blobRef.current
    if (!chave || !atual) return
    // A URL é um recurso externo com ciclo de vida próprio: precisa ser criada e revogada
    // no mesmo effect. Com useMemo, o StrictMode revogaria a URL sem recriá-la.
    const url = URL.createObjectURL(atual)
    // oxlint-disable-next-line react/set-state-in-effect
    setEntry({ chave, url })
    return () => URL.revokeObjectURL(url)
  }, [chave, temBlob])

  // Evita devolver a URL de outro Blob enquanto a nova ainda não foi criada.
  return temBlob && entry && entry.chave === chave ? entry.url : null
}
