import { listPendientesDeEvaluar, crearEvaluacion } from '@/actions/evaluaciones'
import { EvaluacionForm } from '@/components/evaluacion/EvaluacionForm'

export default async function EvaluacionesPage() {
  let pendientes: Awaited<ReturnType<typeof listPendientesDeEvaluar>>
  try {
    pendientes = await listPendientesDeEvaluar()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudieron cargar los partidos pendientes.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Partidos jugados pendientes de evaluar</h1>
      <p className="text-sm text-muted">
        Cada fila es un partido ya jugado con una designación aceptada y sin ninguna evaluación cargada.
        Con agregar una evaluación de cualquier tipo, el partido sale de esta lista.
      </p>

      {pendientes.length === 0 && (
        <p className="text-sm text-muted">No hay partidos pendientes de evaluar.</p>
      )}

      <div className="flex flex-col gap-4">
        {pendientes.map((p) => (
          <div key={p.designacion_id} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-medium">
              {p.referee_nombre} — {p.partido_label}
            </p>
            <p className="mb-3 text-xs text-muted">
              {p.fecha} · {p.categoria}
            </p>
            <EvaluacionForm
              refereeId={p.referee_id}
              partidoId={p.partido_id}
              crearEvaluacion={crearEvaluacion}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
