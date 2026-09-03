import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES, type Rol } from '@/lib/auth/roles'

const NAV_POR_ROL: Record<Rol, { href: string; label: string }[]> = {
  [ROLES.ADMIN_NACIONAL]: [
    { href: '/admin/catalogos/regiones', label: 'Regiones' },
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
  ],
  [ROLES.ADMIN_REGIONAL]: [
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
  ],
  [ROLES.DESIGNADOR]: [],
  [ROLES.EVALUADOR]: [],
  [ROLES.REFEREE]: [{ href: '/disponibilidad', label: 'Mi disponibilidad' }],
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getProfile()
  if (!perfil) redirect('/login')

  const items = NAV_POR_ROL[perfil.rol] ?? []

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 border-r p-4">
        <p className="mb-4 text-sm text-slate-500">
          {perfil.nombre} · {perfil.rol}
        </p>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-sm hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
