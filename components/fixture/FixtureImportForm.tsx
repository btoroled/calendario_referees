'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  ligaId: string
  temporadaId: string
  importarFixture: (input: { liga_id: string; temporada_id: string; csvText: string }) => Promise<{ importados: number }>
}

export function FixtureImportForm({ ligaId, temporadaId, importarFixture }: Props) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    if (!archivo) {
      setError('Selecciona un archivo CSV.')
      return
    }
    startTransition(async () => {
      try {
        const csvText = await archivo.text()
        const resultado = await importarFixture({ liga_id: ligaId, temporada_id: temporadaId, csvText })
        setMensaje(`Se importaron ${resultado.importados} partidos.`)
        setArchivo(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al importar el fixture.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <label className="text-xs text-muted">Archivo CSV del fixture semanal</label>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        className="text-sm text-foreground"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Importando...' : 'Importar'}
      </button>
      {mensaje && <p className="text-sm text-foreground">{mensaje}</p>}
      {error && <pre className="whitespace-pre-wrap text-sm text-danger">{error}</pre>}
    </form>
  )
}
