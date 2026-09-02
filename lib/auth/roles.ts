export const ROLES = {
  ADMIN_NACIONAL: 'admin_nacional',
  ADMIN_REGIONAL: 'admin_regional',
  DESIGNADOR: 'designador',
  EVALUADOR: 'evaluador',
  REFEREE: 'referee',
} as const

export type Rol = (typeof ROLES)[keyof typeof ROLES]

export function puedeGestionarCatalogos(rol: Rol): boolean {
  return rol === ROLES.ADMIN_NACIONAL || rol === ROLES.ADMIN_REGIONAL
}
