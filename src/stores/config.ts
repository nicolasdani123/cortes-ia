import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ConfigValues {
  apiKey: string
  duracaoMinima: number
  duracaoMaxima: number
  maxCortes: number
}

interface ConfigState extends ConfigValues {
  setApiKey: (apiKey: string) => void
  setOpcoes: (opcoes: Pick<ConfigValues, 'duracaoMinima' | 'duracaoMaxima' | 'maxCortes'>) => void
}

export const CONFIG_PADRAO: ConfigValues = {
  apiKey: '',
  duracaoMinima: 20,
  duracaoMaxima: 90,
  maxCortes: 10,
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...CONFIG_PADRAO,
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setOpcoes: (opcoes) => set(opcoes),
    }),
    {
      name: 'corteia-config',
      storage: createJSONStorage(() => localStorage),
      // v0 guardava a chave da OpenAI; a partir da v1 a chave é do Groq, então a antiga é descartada.
      version: 1,
      migrate: (persisted, version) => {
        const salvo = persisted as Partial<ConfigValues>
        return version < 1 ? { ...CONFIG_PADRAO, ...salvo, apiKey: '' } : { ...CONFIG_PADRAO, ...salvo }
      },
      partialize: ({ apiKey, duracaoMinima, duracaoMaxima, maxCortes }) => ({
        apiKey,
        duracaoMinima,
        duracaoMaxima,
        maxCortes,
      }),
    },
  ),
)

export const useHasApiKey = () => useConfigStore((s) => s.apiKey.length > 0)

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return '•'.repeat(apiKey.length)
  return `${apiKey.slice(0, 5)}${'•'.repeat(12)}${apiKey.slice(-4)}`
}
