import { listRegiones, crearRegion } from '@/actions/catalogos'
import { RegionForm } from '@/components/catalogos/RegionForm'

export default async function RegionesPage() {
  const regiones = await listRegiones()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Regiones</h1>
      <RegionForm crearRegion={crearRegion} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Código</th>
          </tr>
        </thead>
        <tbody>
          {regiones.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1">{r.nombre}</td>
              <td className="py-1">{r.codigo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
