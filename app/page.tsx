import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'

export default async function HomePage() {
  const perfil = await getProfile()
  redirect(perfil ? '/dashboard' : '/login')
}
