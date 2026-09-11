'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  partidoId: string
  refereeId: string
  esReasignacion: boolean
  confirmarDesignacion: (input: { partidoId: string; refereeId: string }) => Promise<void>
}

export function BotonConfirmarDesignacion({
  partidoId,
  refereeId,
  esReasignacion,
  confirmarDesignacion,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        await confirmarDesignacion({ partidoId, refereeId })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo confirmar la designación.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : esReasignacion ? 'Reasignar' : 'Confirmar'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
