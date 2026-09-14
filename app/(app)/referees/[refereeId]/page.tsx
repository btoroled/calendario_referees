import Link from 'next/link'
import { obtenerPerfilReferee } from '@/actions/perfilReferee'

export default async function PerfilRefereePage({
  params,
}: {
  params: Promise<{ refereeId: string }>
}) {
  const { refereeId } = await params

  let perfil: Awaited<ReturnType<typeof obtenerPerfilReferee>>
  try {
    perfil = await obtenerPerfilReferee(refereeId)
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar el perfil.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold">{perfil.nombre}</h1>
        <p className="text-sm text-muted">
          {perfil.club_nombre ?? 'Sin club'} · categoría {perfil.categoria} · designaciones aceptadas
          esta temporada: {perfil.designacionesAceptadasEnTemporada}
        </p>
      </div>

      <h2 className="text-base font-semibold">Historial de partidos</h2>
      {perfil.timeline.length === 0 && (
        <p className="text-sm text-muted">Sin partidos designados todavía.</p>
      )}

      <div className="flex flex-col gap-3">
        {perfil.timeline.map((t) => (
          <div key={t.partido_id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{t.rival_label}</p>
              <p className="text-xs text-muted">
                {t.fecha} · complejidad {t.complejidad ?? '—'} · {t.estado_aceptacion}
              </p>
            </div>

            {t.evaluaciones.length > 0 && (
              <div className="mt-2 text-xs text-muted">
                Evaluaciones:{' '}
                {t.evaluaciones.map((e) => `${e.tipo} ${e.valor.toFixed(1)}`).join(' · ')}
              </div>
            )}

            {t.autoevaluacion && (
              <div className="mt-2 rounded bg-background p-2 text-xs text-muted">
                <div>
                  Autocalificación:{' '}
                  {t.autoevaluacion.autocalificacion_general?.toFixed(1) ?? '—'}
                </div>
                {t.autoevaluacion.comentario_autoevaluacion && (
                  <div>Comentario: {t.autoevaluacion.comentario_autoevaluacion}</div>
                )}
                {t.autoevaluacion.incidentes_reportados && (
                  <div>Incidentes: {t.autoevaluacion.incidentes_reportados}</div>
                )}
                {t.autoevaluacion.condiciones_cancha && (
                  <div>Cancha: {t.autoevaluacion.condiciones_cancha}</div>
                )}
                {t.autoevaluacion.condiciones_clima && (
                  <div>Clima: {t.autoevaluacion.condiciones_clima}</div>
                )}
                {t.autoevaluacion.comportamiento_equipos && (
                  <div>Equipos: {t.autoevaluacion.comportamiento_equipos}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Link href="/fixture" className="text-sm text-primary hover:underline">
        ← Volver al fixture
      </Link>
    </div>
  )
}
