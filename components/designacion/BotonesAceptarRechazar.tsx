'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  designacionId: string
  aceptarDesignacion: (id: string) => Promise<void>
  rechazarDesignacion: (id: string) => Promise<void>
}

export function BotonesAceptarRechazar({
  designacionId,
  aceptarDesignacion,
  rechazarDesignacion,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar(fn: (id: string) => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn(designacionId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al responder la designación.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ejecutar(aceptarDesignacion)}
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        Aceptar
      </button>
      <button
        type="button"
        onClick={() => ejecutar(rechazarDesignacion)}
        disabled={isPending}
        className="rounded border border-border px-3 py-1 text-xs text-danger hover:underline disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
