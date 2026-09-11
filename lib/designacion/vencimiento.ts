export function designacionesAVencer(input: {
  pendientes: { id: string; fecha_confirmacion: string | null }[]
  ahora: string
  horasLimite?: number
}): string[] {
  const limiteMs = (input.horasLimite ?? 48) * 60 * 60 * 1000
  const ahoraMs = new Date(input.ahora).getTime()
  return input.pendientes
    .filter((d) => {
      if (!d.fecha_confirmacion) return false
      const transcurrido = ahoraMs - new Date(d.fecha_confirmacion).getTime()
      return transcurrido > limiteMs
    })
    .map((d) => d.id)
}
