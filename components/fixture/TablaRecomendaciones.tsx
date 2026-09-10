'use client'

import { Fragment, useState } from 'react'
import type { RecomendacionReferee } from '@/actions/recomendaciones'

function BadgeDesglose({ rec }: { rec: RecomendacionReferee }) {
  const d = rec.score.desglose
  return (
    <div className="flex flex-col gap-1 rounded bg-background p-2 text-xs text-muted">
      <div>Score base: {d.scoreBase.toFixed(1)}</div>
      {Object.entries(d.aportePorTipo).map(([tipo, aporte]) => (
        <div key={tipo}>
          {tipo}: valor {d.valorPorTipo[tipo as keyof typeof d.valorPorTipo]?.toFixed(1)} · peso{' '}
          {d.pesosUsados[tipo as keyof typeof d.pesosUsados].toFixed(2)} · aporte {aporte.toFixed(2)}
        </div>
      ))}
      {d.tiposExcluidos.length > 0 && <div>Sin evaluaciones de: {d.tiposExcluidos.join(', ')}</div>}
      {d.ajustePorComplejidad && <div>Ajuste por alta complejidad aplicado.</div>}
      {d.penalizacionClub && <div>Penalización por pertenecer a un club del partido.</div>}
    </div>
  )
}

export function TablaRecomendaciones({
  recomendaciones,
  noDisponibles,
}: {
  recomendaciones: RecomendacionReferee[]
  noDisponibles: RecomendacionReferee[]
}) {
  const [expandido, setExpandido] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Referee</th>
            <th className="px-4 py-2">Club</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Score</th>
            <th className="px-4 py-2">Alertas</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {recomendaciones.map((rec, i) => (
            <Fragment key={rec.referee_id}>
              <tr className="border-t border-border">
                <td className="px-4 py-2">{i + 1}</td>
                <td className="px-4 py-2">{rec.nombre}</td>
                <td className="px-4 py-2">{rec.club_nombre ?? '—'}</td>
                <td className="px-4 py-2">{rec.categoria}</td>
                <td className="px-4 py-2 font-semibold">{rec.score.scoreFinal.toFixed(1)}</td>
                <td className="px-4 py-2">
                  {rec.alertaCategoria && (
                    <span className="mr-1 rounded bg-amber-500/20 px-1 text-amber-600">categoría</span>
                  )}
                  {rec.perteneceAClub && (
                    <span className="rounded bg-amber-500/20 px-1 text-amber-600">club</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandido(expandido === rec.referee_id ? null : rec.referee_id)}
                    className="text-primary hover:underline"
                  >
                    {expandido === rec.referee_id ? 'ocultar' : 'desglose'}
                  </button>
                </td>
              </tr>
              {expandido === rec.referee_id && (
                <tr className="border-t border-border">
                  <td colSpan={7} className="px-4 py-2">
                    <BadgeDesglose rec={rec} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {noDisponibles.length > 0 && (
        <details className="rounded-lg border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer text-muted">
            {noDisponibles.length} referee(s) no disponibles en el horario del partido
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted">
            {noDisponibles.map((r) => (
              <li key={r.referee_id}>
                {r.nombre} — {r.categoria}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
