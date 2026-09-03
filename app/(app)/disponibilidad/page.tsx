import { listMiDisponibilidad, crearDisponibilidad, eliminarDisponibilidad } from '@/actions/disponibilidad'
import { DisponibilidadForm } from '@/components/disponibilidad/DisponibilidadForm'
import { EliminarDisponibilidadButton } from '@/components/disponibilidad/EliminarDisponibilidadButton'

export default async function DisponibilidadPage() {
  let ventanas: Awaited<ReturnType<typeof listMiDisponibilidad>>
  try {
    ventanas = await listMiDisponibilidad()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar tu disponibilidad.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Mi disponibilidad</h1>
      <p className="text-sm text-muted">
        Marca las ventanas donde SÍ estás disponible para arbitrar. Si no cargas nada para una fecha, se te
        considera no disponible por defecto.
      </p>
      <DisponibilidadForm crearDisponibilidad={crearDisponibilidad} />
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Desde</th>
            <th className="px-4 py-2">Hasta</th>
            <th className="px-4 py-2">Disponible</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {ventanas.map((v) => (
            <tr key={v.id} className="border-t border-border">
              <td className="px-4 py-2">{new Date(v.fecha_inicio).toLocaleString('es-PE')}</td>
              <td className="px-4 py-2">{new Date(v.fecha_fin).toLocaleString('es-PE')}</td>
              <td className="px-4 py-2">{v.disponible ? 'Sí' : 'No (excepción)'}</td>
              <td className="px-4 py-2">
                <EliminarDisponibilidadButton id={v.id} eliminarDisponibilidad={eliminarDisponibilidad} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
