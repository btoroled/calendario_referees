'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  crearRegion: (input: { nombre: string; codigo: string }) => Promise<void>
}

export function RegionForm({ crearRegion }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearRegion({ nombre, codigo })
        setNombre('')
        setCodigo('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear la región.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className="rounded border px-2 py-1"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Código</label>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          required
          className="rounded border px-2 py-1"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
