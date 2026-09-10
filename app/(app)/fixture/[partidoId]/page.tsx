import Link from 'next/link'
import { recomendarReferees } from '@/actions/recomendaciones'
import { TablaRecomendaciones } from '@/components/fixture/TablaRecomendaciones'

export default async function DetallePartidoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>
}) {
  const { partidoId } = await params
  const data = await recomendarReferees(partidoId)
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
      </div>

      <h2 className="text-base font-semibold">Referees recomendados (puesto R1)</h2>
      <TablaRecomendaciones
        recomendaciones={data.recomendaciones}
        noDisponibles={data.noDisponibles}
      />
    </div>
  )
}
