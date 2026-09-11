import { listConfiguracionesScoring, actualizarConfiguracionScoring } from '@/actions/configuracion'
import { ConfiguracionScoringForm } from '@/components/configuracion/ConfiguracionScoringForm'

export default async function ConfiguracionScoringPage() {
  let configs: Awaited<ReturnType<typeof listConfiguracionesScoring>>
  try {
    configs = await listConfiguracionesScoring()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar la configuración.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Configuración de scoring por liga</h1>
      {configs.length === 0 && (
        <p className="text-sm text-muted">No hay ligas con configuración en tu ámbito.</p>
      )}
      {configs.map((c) => (
        <ConfiguracionScoringForm
          key={c.liga_id}
          inicial={c}
          actualizar={actualizarConfiguracionScoring}
        />
      ))}
    </div>
  )
}
