import { Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { ACCEPT_INPUT } from '@/lib/video'
import { cn } from '@/lib/utils'

interface VideoDropzoneProps {
  onFile: (file: File) => void
}

export function VideoDropzone({ onFile }: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setArrastando(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors',
          'hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none',
          arrastando && 'border-primary bg-primary/10',
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Upload className="size-5" />
        </span>
        <span className="font-medium">Arraste o vídeo aqui ou clique para escolher</span>
        <span className="text-sm text-muted-foreground">MP4, MOV, WEBM ou MKV</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_INPUT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Permite escolher o mesmo arquivo de novo depois de trocar.
          e.target.value = ''
        }}
      />
    </>
  )
}
