import { getProfile } from '@/lib/auth/getProfile'

export default async function DashboardPage() {
  const perfil = await getProfile()

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h1 className="text-lg font-semibold">Bienvenido, {perfil?.nombre}</h1>
      <p className="text-sm text-muted">Rol: {perfil?.rol}</p>
    </div>
  )
}
