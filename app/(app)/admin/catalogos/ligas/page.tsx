import { listLigas, listRegiones, crearLiga } from '@/actions/catalogos'
import { LigaForm } from '@/components/catalogos/LigaForm'

export default async function LigasPage() {
  const [ligas, regiones] = await Promise.all([listLigas(), listRegiones()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Ligas</h1>
      <LigaForm crearLiga={crearLiga} regiones={regiones} />
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Nombre</th>
            <th className="px-4 py-2">Código</th>
            <th className="px-4 py-2">Región</th>
          </tr>
        </thead>
        <tbody>
          {ligas.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-4 py-2">{l.nombre}</td>
              <td className="px-4 py-2">{l.codigo}</td>
              <td className="px-4 py-2">{l.region?.nombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
