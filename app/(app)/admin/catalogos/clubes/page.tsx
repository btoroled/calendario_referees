import { listClubes, listRegiones, crearClub } from '@/actions/catalogos'
import { ClubForm } from '@/components/catalogos/ClubForm'

export default async function ClubesPage() {
  const [clubes, regiones] = await Promise.all([listClubes(), listRegiones()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Clubes</h1>
      <ClubForm crearClub={crearClub} regiones={regiones} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Código</th>
            <th className="py-1">Región</th>
          </tr>
        </thead>
        <tbody>
          {clubes.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-1">{c.nombre}</td>
              <td className="py-1">{c.codigo}</td>
              <td className="py-1">{c.region?.nombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
