'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  id: string
  eliminarDisponibilidad: (id: string) => Promise<void>
}

export function EliminarDisponibilidadButton({ id, eliminarDisponibilidad }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await eliminarDisponibilidad(id)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-danger hover:underline disabled:opacity-50"
    >
      {isPending ? 'Eliminando...' : 'Eliminar'}
    </button>
  )
}
