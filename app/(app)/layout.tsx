import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES, type Rol } from '@/lib/auth/roles'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

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
    <div className="flex min-h-screen bg-background text-foreground">
      <nav className="flex w-56 flex-col justify-between border-r border-border bg-surface p-4">
        <div>
          <div className="mb-6 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="text-sm font-semibold tracking-tight">Rugby</span>
          </div>
          <p className="mb-4 text-xs text-muted">
            {perfil.nombre} · {perfil.rol}
          </p>
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <ThemeToggle />
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
