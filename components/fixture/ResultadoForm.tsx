'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoInput } from '@/lib/fixture/validarResultado'

type Props = {
  partidoId: string
  clubLocal: string
  clubVisita: string
  inicial: ResultadoInput
  guardarResultado: (input: { partidoId: string } & ResultadoInput) => Promise<void>
}

const CAMPOS_TARJETA: { name: keyof ResultadoInput; label: string }[] = [
  { name: 'tarjetas_amarillas_local', label: 'Amarillas local' },
  { name: 'tarjetas_amarillas_visita', label: 'Amarillas visita' },
  { name: 'tarjetas_rojas_local', label: 'Rojas local' },
  { name: 'tarjetas_rojas_visita', label: 'Rojas visita' },
]

export function ResultadoForm({ partidoId, clubLocal, clubVisita, inicial, guardarResultado }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<ResultadoInput>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function set<K extends keyof ResultadoInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOkMsg(null)
    startTransition(async () => {
      try {
        await guardarResultado({ partidoId, ...form })
        setOkMsg('Resultado guardado.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el resultado.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-muted">{clubLocal} (local)</label>
          <input
            inputMode="numeric"
            value={form.resultado_local}
            onChange={(e) => set('resultado_local', e.target.value)}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
        <span className="pb-1 text-muted">—</span>
        <div className="flex flex-col">
          <label className="text-xs text-muted">{clubVisita} (visita)</label>
          <input
            inputMode="numeric"
            value={form.resultado_visita}
            onChange={(e) => set('resultado_visita', e.target.value)}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CAMPOS_TARJETA.map((c) => (
          <div key={c.name} className="flex flex-col">
            <label className="text-xs text-muted">{c.label}</label>
            <input
              inputMode="numeric"
              value={form[c.name]}
              onChange={(e) => set(c.name, e.target.value)}
              placeholder="0"
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-muted">Incidentes (opcional)</label>
        <textarea
          value={form.incidentes}
          onChange={(e) => set('incidentes', e.target.value)}
          rows={3}
          className="rounded border border-border bg-background px-2 py-1 text-foreground"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar resultado'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {okMsg && <span className="text-sm text-muted">{okMsg}</span>}
      </div>
    </form>
  )
}
