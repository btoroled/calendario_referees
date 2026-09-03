import { listClubes, listRegiones, crearClub } from '@/actions/catalogos'
import { ClubForm } from '@/components/catalogos/ClubForm'

export default async function ClubesPage() {
  const [clubes, regiones] = await Promise.all([listClubes(), listRegiones()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Clubes</h1>
      <ClubForm crearClub={crearClub} regiones={regiones} />
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Nombre</th>
            <th className="px-4 py-2">Código</th>
            <th className="px-4 py-2">Región</th>
            <th className="px-4 py-2">Activo</th>
          </tr>
        </thead>
        <tbody>
          {clubes.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-4 py-2">{c.nombre}</td>
              <td className="px-4 py-2">{c.codigo}</td>
              <td className="px-4 py-2">{c.region?.nombre}</td>
              <td className="px-4 py-2">{c.activo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
