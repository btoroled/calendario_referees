'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Region } from '@/actions/catalogos'

type Props = {
  crearLiga: (input: { nombre: string; codigo: string; region_id: string }) => Promise<void>
  regiones: Region[]
}

export function LigaForm({ crearLiga, regiones }: Props) {
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
        await crearLiga({ nombre, codigo, region_id: regionId })
        setNombre('')
        setCodigo('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear la liga.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col">
        <label className="text-xs text-muted">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted">Código</label>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted">Región</label>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring">
          {regiones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50">
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}
