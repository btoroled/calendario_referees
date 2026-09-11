import { describe, it, expect } from 'vitest'
import { validarVentana } from '@/lib/disponibilidad/validacion'

describe('validarVentana', () => {
  it('acepta una ventana válida (fin después de inicio)', () => {
    expect(
      validarVentana({ fecha_inicio: '2026-10-01T09:00', fecha_fin: '2026-10-01T18:00' })
    ).toBeNull()
  })

  it('rechaza cuando fin es igual a inicio', () => {
    expect(
      validarVentana({ fecha_inicio: '2026-10-01T09:00', fecha_fin: '2026-10-01T09:00' })
    ).toBe('La fecha de fin debe ser posterior a la fecha de inicio.')
  })

  it('rechaza cuando fin es anterior a inicio', () => {
    expect(
      validarVentana({ fecha_inicio: '2026-10-01T18:00', fecha_fin: '2026-10-01T09:00' })
    ).toBe('La fecha de fin debe ser posterior a la fecha de inicio.')
  })

  it('rechaza fechas inválidas', () => {
    expect(
      validarVentana({ fecha_inicio: 'no-es-fecha', fecha_fin: '2026-10-01T09:00' })
    ).toBe('Fechas inválidas.')
  })
})
