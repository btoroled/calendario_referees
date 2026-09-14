import Link from 'next/link'
import { listLigas, listTemporadas, listClubes } from '@/actions/catalogos'
import { crearPartidoManual } from '@/actions/fixture'
import { FixtureManualForm } from '@/components/fixture/FixtureManualForm'

export default async function FixtureNuevoPage({
  searchParams,
}: {
  searchParams: Promise<{ liga_id?: string; temporada_id?: string }>
}) {
  const params = await searchParams
  const ligaId = params.liga_id ?? ''
  const temporadaId = params.temporada_id ?? ''

  if (!ligaId || !temporadaId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Agregar partido manual</h1>
        <p className="text-sm text-muted">
          Elegí una liga y una temporada en{' '}
          <Link href="/fixture" className="text-primary hover:underline">
            Fixture
          </Link>{' '}
          antes de agregar un partido manual.
        </p>
      </div>
    )
  }

  const [ligas, temporadas, clubes] = await Promise.all([listLigas(), listTemporadas(), listClubes()])
  const liga = ligas.find((l) => l.id === ligaId)
  const temporada = temporadas.find((t) => t.id === temporadaId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Agregar partido manual</h1>
        <p className="text-sm text-muted">
          {liga?.nombre} · {temporada?.nombre}
        </p>
      </div>

      <FixtureManualForm
        ligaId={ligaId}
        temporadaId={temporadaId}
        clubes={clubes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        crearPartidoManual={crearPartidoManual}
      />

      <Link href={`/fixture?liga_id=${ligaId}&temporada_id=${temporadaId}`} className="w-fit text-sm text-primary hover:underline">
        ← Volver al fixture
      </Link>
    </div>
  )
}
