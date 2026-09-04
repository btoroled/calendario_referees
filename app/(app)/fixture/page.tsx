import { listLigas, listTemporadas } from '@/actions/catalogos'
import { listPartidos, importarFixture } from '@/actions/fixture'
import { FixtureImportForm } from '@/components/fixture/FixtureImportForm'

export default async function FixturePage({
  searchParams,
}: {
  searchParams: Promise<{ liga_id?: string; temporada_id?: string }>
}) {
  const params = await searchParams
  const [ligas, temporadas] = await Promise.all([listLigas(), listTemporadas()])

  const ligaId = params.liga_id ?? ligas[0]?.id ?? ''
  const temporadasDeLiga = temporadas.filter((t) => t.liga_id === ligaId)
  const temporadaId = params.temporada_id ?? temporadasDeLiga[0]?.id ?? ''

  const partidos = ligaId && temporadaId ? await listPartidos({ liga_id: ligaId, temporada_id: temporadaId }) : []

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Fixture</h1>

      <form method="get" className="flex items-end gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col">
          <label className="text-xs text-muted">Liga</label>
          <select
            name="liga_id"
            defaultValue={ligaId}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            {ligas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Temporada</label>
          <select
            name="temporada_id"
            defaultValue={temporadaId}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            {temporadasDeLiga.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Ver
        </button>
      </form>

      {ligaId && temporadaId && (
        <FixtureImportForm ligaId={ligaId} temporadaId={temporadaId} importarFixture={importarFixture} />
      )}

      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Fecha</th>
            <th className="px-4 py-2">Hora</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Local</th>
            <th className="px-4 py-2">Visita</th>
            <th className="px-4 py-2">Cancha</th>
            <th className="px-4 py-2">Jornada</th>
          </tr>
        </thead>
        <tbody>
          {partidos.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-4 py-2">{p.fecha}</td>
              <td className="px-4 py-2">{p.hora}</td>
              <td className="px-4 py-2">{p.categoria}</td>
              <td className="px-4 py-2">{p.club_local?.nombre}</td>
              <td className="px-4 py-2">{p.club_visita?.nombre}</td>
              <td className="px-4 py-2">{p.cancha}</td>
              <td className="px-4 py-2">{p.jornada}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
