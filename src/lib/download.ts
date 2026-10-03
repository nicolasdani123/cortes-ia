/** Título → nome de arquivo sem acentos nem símbolos ("Como começar?" → "Como-comecar"). */
export function nomeDeArquivo(titulo: string, padrao: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return base || padrao
}

/** Salva o blob na pasta de downloads do navegador. */
export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  // Revogar na hora pode cancelar o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
