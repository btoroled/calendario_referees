'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type ClubOption = { id: string; nombre: string }

type Props = {
  ligaId: string
  temporadaId: string
  clubes: ClubOption[]
  crearPartidoManual: (input: {
    liga_id: string
    temporada_id: string
    fecha: string
    hora: string
    cancha: string
    categoria: string
    club_local_id: string
    club_visita_id: string
    jornada: number | null
  }) => Promise<{ id: string }>
}

export function FixtureManualForm({ ligaId, temporadaId, clubes, crearPartidoManual }: Props) {
  const router = useRouter()
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [cancha, setCancha] = useState('')
  const [categoria, setCategoria] = useState('')
  const [clubLocalId, setClubLocalId] = useState('')
  const [clubVisitaId, setClubVisitaId] = useState('')
  const [jornada, setJornada] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!clubLocalId || !clubVisitaId) {
      setError('Elegí el club local y el club visita.')
      return
    }
    if (clubLocalId === clubVisitaId) {
      setError('El club local y el club visita no pueden ser el mismo.')
      return
    }

    startTransition(async () => {
      try {
        await crearPartidoManual({
          liga_id: ligaId,
          temporada_id: temporadaId,
          fecha,
          hora,
          cancha,
          categoria,
          club_local_id: clubLocalId,
          club_visita_id: clubVisitaId,
          jornada: jornada ? Number(jornada) : null,
        })
        router.push(`/fixture?liga_id=${ligaId}&temporada_id=${temporadaId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo crear el partido.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col">
          <label className="text-xs text-muted">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Hora</label>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            required
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Categoría</label>
          <input
            type="text"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            required
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Cancha</label>
          <input
            type="text"
            value={cancha}
            onChange={(e) => setCancha(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Club local</label>
          <select
            value={clubLocalId}
            onChange={(e) => setClubLocalId(e.target.value)}
            required
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">Elegir...</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Club visita</label>
          <select
            value={clubVisitaId}
            onChange={(e) => setClubVisitaId(e.target.value)}
            required
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">Elegir...</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Jornada (opcional)</label>
          <input
            type="number"
            min={1}
            step={1}
            value={jornada}
            onChange={(e) => setJornada(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Creando...' : 'Crear partido'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  )
}
