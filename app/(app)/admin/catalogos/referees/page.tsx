import Link from 'next/link'
import { listReferees, listRegiones, listClubes, crearReferee } from '@/actions/catalogos'
import { RefereeForm } from '@/components/catalogos/RefereeForm'

export default async function RefereesPage() {
  const [referees, regiones, clubes] = await Promise.all([listReferees(), listRegiones(), listClubes()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Referees</h1>
      <RefereeForm crearReferee={crearReferee} regiones={regiones} clubes={clubes} />
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Nombre</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Club</th>
            <th className="px-4 py-2">Activo</th>
          </tr>
        </thead>
        <tbody>
          {referees.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-2">
                <Link href={`/referees/${r.id}`} className="text-primary hover:underline">
                  {r.nombre}
                </Link>
              </td>
              <td className="px-4 py-2">{r.categoria}</td>
              <td className="px-4 py-2">{r.club?.nombre ?? '—'}</td>
              <td className="px-4 py-2">{r.arbitro_activo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
