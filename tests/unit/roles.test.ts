import { describe, it, expect } from 'vitest'
import { ROLES, puedeGestionarCatalogos } from '@/lib/auth/roles'

describe('puedeGestionarCatalogos', () => {
  it('permite a admin_nacional', () => {
    expect(puedeGestionarCatalogos(ROLES.ADMIN_NACIONAL)).toBe(true)
  })

  it('permite a admin_regional', () => {
    expect(puedeGestionarCatalogos(ROLES.ADMIN_REGIONAL)).toBe(true)
  })

  it('no permite a designador', () => {
    expect(puedeGestionarCatalogos(ROLES.DESIGNADOR)).toBe(false)
  })

  it('no permite a evaluador', () => {
    expect(puedeGestionarCatalogos(ROLES.EVALUADOR)).toBe(false)
  })

  it('no permite a referee', () => {
    expect(puedeGestionarCatalogos(ROLES.REFEREE)).toBe(false)
  })
})
