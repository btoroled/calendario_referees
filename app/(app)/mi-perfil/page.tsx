import { redirect } from 'next/navigation'
import { obtenerMiRefereeId } from '@/actions/perfilReferee'

export default async function MiPerfilPage() {
  let refereeId: string
  try {
    refereeId = await obtenerMiRefereeId()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo resolver tu perfil.'}
      </div>
    )
  }
  redirect(`/referees/${refereeId}`)
}
