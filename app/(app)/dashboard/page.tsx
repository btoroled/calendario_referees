import { getProfile } from '@/lib/auth/getProfile'

export default async function DashboardPage() {
  const perfil = await getProfile()

  return (
    <div>
      <h1 className="text-lg font-semibold">Bienvenido, {perfil?.nombre}</h1>
      <p className="text-sm text-slate-500">Rol: {perfil?.rol}</p>
    </div>
  )
}
