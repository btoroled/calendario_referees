import { listReferees, listRegiones, listClubes, crearReferee } from '@/actions/catalogos'
import { RefereeForm } from '@/components/catalogos/RefereeForm'

export default async function RefereesPage() {
  const [referees, regiones, clubes] = await Promise.all([listReferees(), listRegiones(), listClubes()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Referees</h1>
      <RefereeForm crearReferee={crearReferee} regiones={regiones} clubes={clubes} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Categoría</th>
            <th className="py-1">Club</th>
            <th className="py-1">Activo</th>
          </tr>
        </thead>
        <tbody>
          {referees.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1">{r.nombre}</td>
              <td className="py-1">{r.categoria}</td>
              <td className="py-1">{r.club?.nombre ?? '—'}</td>
              <td className="py-1">{r.activo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
