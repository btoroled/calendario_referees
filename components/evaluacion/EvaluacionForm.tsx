'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Tipo = 'performance' | 'fisico' | 'videoanalisis' | 'coaching'

const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'performance', label: 'Performance' },
  { value: 'fisico', label: 'Físico' },
  { value: 'videoanalisis', label: 'Videoanálisis' },
  { value: 'coaching', label: 'Coaching' },
]

type Props = {
  refereeId: string
  partidoId: string
  crearEvaluacion: (input: {
    referee_id: string
    partido_id: string
    tipo: Tipo
    valor: number
  }) => Promise<void>
}

export function EvaluacionForm({ refereeId, partidoId, crearEvaluacion }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState<Tipo>('performance')
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const n = Number(valor)
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      setError('El valor debe estar entre 0 y 10.')
      return
    }
    startTransition(async () => {
      try {
        await crearEvaluacion({ referee_id: refereeId, partido_id: partidoId, tipo, valor: n })
        setValor('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la evaluación.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-muted">Tipo</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as Tipo)}
          className="rounded border border-border bg-background px-2 py-1 text-foreground"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted">Valor (0-10)</label>
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
          className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  )
}
