import Link from 'next/link'
import { recomendarReferees } from '@/actions/recomendaciones'
import { confirmarDesignacion, obtenerDesignacionVigente } from '@/actions/designaciones'
import { TablaRecomendaciones } from '@/components/fixture/TablaRecomendaciones'

export default async function DetallePartidoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>
}) {
  const { partidoId } = await params

  let data: Awaited<ReturnType<typeof recomendarReferees>>
  let designacionVigente: Awaited<ReturnType<typeof obtenerDesignacionVigente>>
  try {
    ;[data, designacionVigente] = await Promise.all([
      recomendarReferees(partidoId),
      obtenerDesignacionVigente(partidoId),
    ])
  } catch (err) {
    console.error(err)
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        No se pudieron cargar las recomendaciones para este partido.
      </div>
    )
  }
  const p = data.partido

  return (
    <div className="flex flex-col gap-6">
      <Link href="/fixture" className="text-sm text-primary hover:underline">
        ← Volver al fixture
      </Link>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold">
          {p.club_local} vs {p.club_visita}
        </h1>
        <p className="text-sm text-muted">
          {p.fecha} {p.hora ?? ''} · {p.categoria} · categoría mínima: {p.categoria_minima_referee} ·
          complejidad: {p.complejidad ?? '—'}
        </p>
        {!p.categoria_minima_mapeada && (
          <p className="mt-2 text-xs text-amber-600">
            Categoría mínima &quot;{p.categoria_minima_referee}&quot; no está mapeada al escalafón — la
            alerta de categoría no se evalúa para este partido.
          </p>
        )}
        {designacionVigente && (
          <p className="mt-2 text-sm">
            Designado: <strong>{designacionVigente.referee_nombre}</strong> ·{' '}
            {designacionVigente.estado_aceptacion}
          </p>
        )}
        {p.fecha <= new Date().toISOString().slice(0, 10) && (
          <Link
            href={`/fixture/${partidoId}/resultado`}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Cargar / editar resultado del partido
          </Link>
        )}
      </div>

      <h2 className="text-base font-semibold">Referees recomendados (puesto R1)</h2>
      <TablaRecomendaciones
        recomendaciones={data.recomendaciones}
        noDisponibles={data.noDisponibles}
        partidoId={partidoId}
        designacionVigente={designacionVigente}
        confirmarDesignacion={confirmarDesignacion}
      />
    </div>
  )
}
