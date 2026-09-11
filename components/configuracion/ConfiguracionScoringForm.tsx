'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ConfiguracionScoringFila } from '@/actions/configuracion'

const CAMPOS_NUMERICOS: { key: keyof ConfiguracionScoringFila; label: string; step: string }[] = [
  { key: 'peso_performance_normal', label: 'Peso performance (normal)', step: '0.001' },
  { key: 'peso_fisico_normal', label: 'Peso físico (normal)', step: '0.001' },
  { key: 'peso_videoanalisis_normal', label: 'Peso videoanálisis (normal)', step: '0.001' },
  { key: 'peso_coaching_normal', label: 'Peso coaching (normal)', step: '0.001' },
  { key: 'peso_performance_alta', label: 'Peso performance (alta)', step: '0.001' },
  { key: 'peso_fisico_alta', label: 'Peso físico (alta)', step: '0.001' },
  { key: 'peso_videoanalisis_alta', label: 'Peso videoanálisis (alta)', step: '0.001' },
  { key: 'peso_coaching_alta', label: 'Peso coaching (alta)', step: '0.001' },
  { key: 'umbral_complejidad_alta', label: 'Umbral de complejidad alta (1-10)', step: '1' },
  { key: 'factor_penalizacion_club', label: 'Factor penalización por club (0-1)', step: '0.001' },
  { key: 'semivida_dias', label: 'Semivida de decaimiento (días)', step: '1' },
  { key: 'score_sin_evaluaciones', label: 'Score base sin evaluaciones', step: '0.1' },
]

export function ConfiguracionScoringForm({
  inicial,
  actualizar,
}: {
  inicial: ConfiguracionScoringFila
  actualizar: (input: ConfiguracionScoringFila) => Promise<void>
}) {
  const router = useRouter()
  const [form, setForm] = useState<ConfiguracionScoringFila>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOkMsg(null)
    startTransition(async () => {
      try {
        await actualizar(form)
        setOkMsg('Configuración guardada.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{form.liga_nombre}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAMPOS_NUMERICOS.map((c) => (
          <div key={c.key} className="flex flex-col">
            <label className="text-xs text-muted">{c.label}</label>
            <input
              type="number"
              step={c.step}
              value={String(form[c.key])}
              onChange={(e) => setForm((f) => ({ ...f, [c.key]: Number(e.target.value) }))}
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.evaluacion_bloqueante}
          onChange={(e) => setForm((f) => ({ ...f, evaluacion_bloqueante: e.target.checked }))}
        />
        Bloquear nuevas designaciones si el referee tiene evaluaciones pendientes
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {okMsg && <span className="text-sm text-muted">{okMsg}</span>}
      </div>
    </form>
  )
}
