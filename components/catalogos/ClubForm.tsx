'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Region } from '@/actions/catalogos'

type Props = {
  crearClub: (input: { nombre: string; codigo: string; region_id: string }) => Promise<void>
  regiones: Region[]
}

export function ClubForm({ crearClub, regiones }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [regionId, setRegionId] = useState(regiones[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearClub({ nombre, codigo, region_id: regionId })
        setNombre('')
        setCodigo('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear el club.')
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
        <label className="text-xs text-slate-500">Código</label>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required className="rounded border px-2 py-1" />
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
      <button type="submit" disabled={isPending} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
