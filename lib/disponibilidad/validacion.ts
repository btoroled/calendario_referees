export function validarVentana(input: { fecha_inicio: string; fecha_fin: string }): string | null {
  const inicio = new Date(input.fecha_inicio)
  const fin = new Date(input.fecha_fin)

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return 'Fechas inválidas.'
  }
  if (fin <= inicio) {
    return 'La fecha de fin debe ser posterior a la fecha de inicio.'
  }
  return null
}
