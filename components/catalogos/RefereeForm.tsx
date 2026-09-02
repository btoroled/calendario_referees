'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Region, Club } from '@/actions/catalogos'

type Props = {
  crearReferee: (input: { nombre: string; categoria: string; club_id: string | null; region_id: string }) => Promise<void>
  regiones: Region[]
  clubes: Club[]
}

export function RefereeForm({ crearReferee, regiones, clubes }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [regionId, setRegionId] = useState(regiones[0]?.id ?? '')
  const [clubId, setClubId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearReferee({ nombre, categoria, club_id: clubId || null, region_id: regionId })
        setNombre('')
        setCategoria('')
        setClubId('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear el referee.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Categoría</label>
        <input value={categoria} onChange={(e) => setCategoria(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Región</label>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded border px-2 py-1">
          {regiones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Club (opcional)</label>
        <select value={clubId} onChange={(e) => setClubId(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Sin club</option>
          {clubes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
