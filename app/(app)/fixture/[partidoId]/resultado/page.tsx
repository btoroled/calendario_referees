import Link from 'next/link'
import { obtenerPartidoParaResultado, guardarResultado } from '@/actions/resultados'
import { ResultadoForm } from '@/components/fixture/ResultadoForm'

function str(n: number | null): string {
  return n === null || n === undefined ? '' : String(n)
}

export default async function ResultadoPartidoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>
}) {
  const { partidoId } = await params

  let partido: Awaited<ReturnType<typeof obtenerPartidoParaResultado>>
  try {
    partido = await obtenerPartidoParaResultado(partidoId)
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar el partido.'}
      </div>
    )
  }

  if (partido.es_historico || !partido.ya_jugado) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/fixture/${partidoId}`} className="text-sm text-primary hover:underline">
          ← Volver al partido
        </Link>
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
          {partido.es_historico
            ? 'Este partido es histórico; su resultado se administra por el script de importación.'
            : 'Este partido todavía no se jugó. Volvé cuando la fecha haya pasado.'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/fixture/${partidoId}`} className="text-sm text-primary hover:underline">
        ← Volver al partido
      </Link>
      <div>
        <h1 className="text-lg font-semibold">
          Resultado: {partido.club_local} vs {partido.club_visita}
        </h1>
        <p className="text-sm text-muted">
          {partido.fecha} {partido.hora ?? ''} · {partido.categoria}
        </p>
      </div>
      <ResultadoForm
        partidoId={partido.id}
        clubLocal={partido.club_local}
        clubVisita={partido.club_visita}
        inicial={{
          resultado_local: str(partido.resultado_local),
          resultado_visita: str(partido.resultado_visita),
          tarjetas_amarillas_local: str(partido.tarjetas_amarillas_local),
          tarjetas_amarillas_visita: str(partido.tarjetas_amarillas_visita),
          tarjetas_rojas_local: str(partido.tarjetas_rojas_local),
          tarjetas_rojas_visita: str(partido.tarjetas_rojas_visita),
          incidentes: partido.incidentes ?? '',
        }}
        guardarResultado={guardarResultado}
      />
    </div>
  )
}
