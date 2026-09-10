import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { designacionesAVencer } from '@/lib/designacion/vencimiento'
import { obtenerTransport } from '@/lib/email/transport'
import { emailVencimiento } from '@/lib/email/mensajes'

// El cron nunca debe servirse desde una respuesta cacheada. Leer `request.headers`
// ya fuerza render dinámico, pero lo declaramos explícito como defensa en profundidad.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: pendientes, error } = await db
    .from('designacion')
    .select(
      'id, partido_id, designado_por, fecha_confirmacion, referee:referee_id(nombre), partido:partido_id(club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('estado', 'confirmado')
    .eq('estado_aceptacion', 'pendiente')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ahora = new Date().toISOString()
  const idsAVencer = designacionesAVencer({
    pendientes: (pendientes ?? []).map((d) => ({ id: d.id, fecha_confirmacion: d.fecha_confirmacion })),
    ahora,
  })

  if (idsAVencer.length === 0) {
    return NextResponse.json({ vencidas: 0 })
  }

  const setAVencer = new Set(idsAVencer)
  const filasAVencer = (pendientes ?? []).filter((d) => setAVencer.has(d.id))

  // UPDATE núcleo: si falla, abortar sin marcar el partido ni enviar el correo,
  // para no afirmar un vencimiento que no persistió.
  const { error: errVencido } = await db
    .from('designacion')
    .update({ estado_aceptacion: 'vencido', fecha_respuesta: ahora })
    .in('id', idsAVencer)
  if (errVencido) return NextResponse.json({ error: errVencido.message }, { status: 500 })

  const partidoIds = [...new Set(filasAVencer.map((d) => d.partido_id))]
  const { error: errAtencion } = await db
    .from('partido')
    .update({ requiere_atencion: true })
    .in('id', partidoIds)
  if (errAtencion) {
    // Las filas ya están 'vencido' y los correos siguen valiendo la pena: log y seguir.
    console.error('[cron vencer] no se pudo marcar requiere_atencion:', errAtencion)
  }

  const transport = obtenerTransport()
  for (const d of filasAVencer) {
    try {
      if (!d.designado_por) continue
      const { data: pd } = await db.from('perfil').select('email').eq('id', d.designado_por).single()
      if (!pd?.email) continue
      const p = d.partido as unknown as {
        club_local: { nombre: string } | null
        club_visita: { nombre: string } | null
      } | null
      await transport.send(
        emailVencimiento({
          designadorEmail: pd.email,
          refereeNombre: (d.referee as unknown as { nombre: string } | null)?.nombre ?? 'El referee',
          partidoLabel: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
        })
      )
    } catch (err) {
      console.error('[cron vencer] email falló (best-effort):', err)
    }
  }

  return NextResponse.json({ vencidas: idsAVencer.length })
}
