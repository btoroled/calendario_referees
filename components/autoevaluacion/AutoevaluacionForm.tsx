'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { AutoevaluacionValores } from '@/actions/autoevaluaciones'

const CAMPOS_TEXTO: { key: keyof AutoevaluacionValores; label: string }[] = [
  { key: 'comentario_autoevaluacion', label: 'Comentario general' },
  { key: 'incidentes_reportados', label: 'Incidentes reportados' },
  { key: 'condiciones_cancha', label: 'Condiciones de cancha' },
  { key: 'condiciones_clima', label: 'Condiciones de clima' },
  { key: 'comportamiento_equipos', label: 'Comportamiento de los equipos' },
]

const VACIO: AutoevaluacionValores = {
  autocalificacion_general: '',
  comentario_autoevaluacion: '',
  incidentes_reportados: '',
  condiciones_cancha: '',
  condiciones_clima: '',
  comportamiento_equipos: '',
}

export function AutoevaluacionForm({
  partidoId,
  inicial,
  guardarAutoevaluacion,
}: {
  partidoId: string
  inicial: AutoevaluacionValores | null
  guardarAutoevaluacion: (input: { partidoId: string } & AutoevaluacionValores) => Promise<void>
}) {
  const router = useRouter()
  const [form, setForm] = useState<AutoevaluacionValores>(inicial ?? VACIO)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOkMsg(null)
    startTransition(async () => {
      try {
        await guardarAutoevaluacion({ partidoId, ...form })
        setOkMsg('Autoevaluación guardada.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la autoevaluación.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col">
        <label className="text-xs text-muted">Autocalificación general (0-10, opcional)</label>
        <input
          inputMode="decimal"
          value={form.autocalificacion_general}
          onChange={(e) => setForm((f) => ({ ...f, autocalificacion_general: e.target.value }))}
          className="w-28 rounded border border-border bg-background px-2 py-1 text-foreground"
        />
      </div>
      {CAMPOS_TEXTO.map((c) => (
        <div key={c.key} className="flex flex-col">
          <label className="text-xs text-muted">{c.label}</label>
          <textarea
            value={form[c.key]}
            onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
            rows={2}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar autoevaluación'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {okMsg && <span className="text-sm text-muted">{okMsg}</span>}
      </div>
    </form>
  )
}
