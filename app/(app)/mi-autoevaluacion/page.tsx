import {
  listMisPartidosParaAutoevaluar,
  obtenerMiAutoevaluacion,
  guardarAutoevaluacion,
} from '@/actions/autoevaluaciones'
import { AutoevaluacionForm } from '@/components/autoevaluacion/AutoevaluacionForm'

export default async function MiAutoevaluacionPage() {
  let partidos: Awaited<ReturnType<typeof listMisPartidosParaAutoevaluar>>
  try {
    partidos = await listMisPartidosParaAutoevaluar()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudieron cargar tus partidos.'}
      </div>
    )
  }

  const valoresPorPartido = await Promise.all(
    partidos.map((p) => obtenerMiAutoevaluacion(p.partido_id))
  )

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Mi autoevaluación post-partido</h1>
      <p className="text-sm text-muted">
        Reporte objetivo de cada partido que arbitraste. No afecta tu score — es registro y contexto
        para el comité y para tu propio historial.
      </p>

      {partidos.length === 0 && (
        <p className="text-sm text-muted">No tenés partidos jugados para autoevaluar.</p>
      )}

      {partidos.map((p, i) => (
        <div key={p.partido_id} className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">{p.partido_label}</p>
          <p className="mb-3 text-xs text-muted">
            {p.fecha} {p.yaAutoevaluado ? '· ya cargada (podés editarla)' : ''}
          </p>
          <AutoevaluacionForm
            partidoId={p.partido_id}
            inicial={valoresPorPartido[i]}
            guardarAutoevaluacion={guardarAutoevaluacion}
          />
        </div>
      ))}
    </div>
  )
}
