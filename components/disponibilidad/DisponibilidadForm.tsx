'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  crearDisponibilidad: (input: { fecha_inicio: string; fecha_fin: string; disponible: boolean }) => Promise<void>
}

export function DisponibilidadForm({ crearDisponibilidad }: Props) {
  const router = useRouter()
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [disponible, setDisponible] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearDisponibilidad({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, disponible })
        setFechaInicio('')
        setFechaFin('')
        setDisponible(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar la ventana de disponibilidad.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col">
        <label className="text-xs text-muted">Desde</label>
        <input
          type="datetime-local"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
          required
          className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted">Hasta</label>
        <input
          type="datetime-local"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          required
          className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
        />
      </div>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={disponible}
          onChange={(e) => setDisponible(e.target.checked)}
        />
        Disponible (desmarca para cargar una excepción de NO disponibilidad)
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}
