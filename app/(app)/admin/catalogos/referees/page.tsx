import Link from 'next/link'
import { listReferees, listRegiones, listClubes, crearReferee } from '@/actions/catalogos'
import { RefereeForm } from '@/components/catalogos/RefereeForm'

export default async function RefereesPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; club_id?: string; arbitro_activo?: string; jugador_activo?: string }>
}) {
  const params = await searchParams
  const [referees, regiones, clubes] = await Promise.all([listReferees(), listRegiones(), listClubes()])

  const categorias = Array.from(new Set(referees.map((r) => r.categoria))).sort()

  const referreesFiltrados = referees.filter((r) => {
    if (params.categoria && r.categoria !== params.categoria) return false
    if (params.club_id && r.club_id !== params.club_id) return false
    if (params.arbitro_activo && r.arbitro_activo !== (params.arbitro_activo === 'si')) return false
    if (params.jugador_activo && r.jugador_activo !== (params.jugador_activo === 'si')) return false
    return true
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Referees</h1>
      <RefereeForm crearReferee={crearReferee} regiones={regiones} clubes={clubes} />

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col">
          <label className="text-xs text-muted">Categoría</label>
          <select
            name="categoria"
            defaultValue={params.categoria ?? ''}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Club</label>
          <select
            name="club_id"
            defaultValue={params.club_id ?? ''}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">Todos</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Árbitro activo</label>
          <select
            name="arbitro_activo"
            defaultValue={params.arbitro_activo ?? ''}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">Todos</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Jugador activo</label>
          <select
            name="jugador_activo"
            defaultValue={params.jugador_activo ?? ''}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">Todos</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Filtrar
        </button>
        {(params.categoria || params.club_id || params.arbitro_activo || params.jugador_activo) && (
          <Link href="/admin/catalogos/referees" className="text-sm text-primary hover:underline">
            Limpiar filtros
          </Link>
        )}
      </form>

      <p className="text-sm text-muted">
        {referreesFiltrados.length} de {referees.length} referees
      </p>

      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Nombre</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Club</th>
            <th className="px-4 py-2">Árbitro activo</th>
            <th className="px-4 py-2">Jugador activo</th>
          </tr>
        </thead>
        <tbody>
          {referreesFiltrados.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-2">
                <Link href={`/referees/${r.id}`} className="text-primary hover:underline">
                  {r.nombre}
                </Link>
              </td>
              <td className="px-4 py-2">{r.categoria}</td>
              <td className="px-4 py-2">{r.club?.nombre ?? '—'}</td>
              <td className="px-4 py-2">{r.arbitro_activo ? 'Sí' : 'No'}</td>
              <td className="px-4 py-2">{r.jugador_activo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
