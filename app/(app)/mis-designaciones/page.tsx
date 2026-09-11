import {
  listMisDesignaciones,
  aceptarDesignacion,
  rechazarDesignacion,
} from '@/actions/designaciones'
import { BotonesAceptarRechazar } from '@/components/designacion/BotonesAceptarRechazar'

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptada',
  rechazado: 'Rechazada',
  vencido: 'Vencida (48 h sin respuesta)',
}

export default async function MisDesignacionesPage() {
  let designaciones: Awaited<ReturnType<typeof listMisDesignaciones>>
  try {
    designaciones = await listMisDesignaciones()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudieron cargar tus designaciones.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Mis designaciones</h1>
      <p className="text-sm text-muted">
        Tenés 48 horas desde que se confirma una designación para aceptarla o rechazarla. Pasado ese
        plazo queda vencida y el designador debe reasignar.
      </p>
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Partido</th>
            <th className="px-4 py-2">Fecha</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {designaciones.map((d) => (
            <tr key={d.id} className="border-t border-border">
              <td className="px-4 py-2">{d.partido_label}</td>
              <td className="px-4 py-2">
                {d.fecha} {d.hora ?? ''}
              </td>
              <td className="px-4 py-2">{d.categoria}</td>
              <td className="px-4 py-2">{ETIQUETA_ESTADO[d.estado_aceptacion] ?? d.estado_aceptacion}</td>
              <td className="px-4 py-2">
                {d.estado_aceptacion === 'pendiente' && (
                  <BotonesAceptarRechazar
                    designacionId={d.id}
                    aceptarDesignacion={aceptarDesignacion}
                    rechazarDesignacion={rechazarDesignacion}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {designaciones.length === 0 && (
        <p className="text-sm text-muted">No tenés designaciones confirmadas todavía.</p>
      )}
    </div>
  )
}
