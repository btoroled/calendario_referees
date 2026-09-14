# Plataforma de Designación de Referees

Next.js (App Router) + Supabase (Postgres + Auth + RLS). Multi-tenant `país → región → liga → temporada`.

## Desarrollo local

```bash
npm install
npx supabase start          # levanta Postgres/Auth/Studio local
npx supabase db reset       # aplica migraciones + seeds
cp .env.local.example .env.local   # completar con los valores de `supabase start`
npm run dev
```

Usuarios seed (password según el seed de auth): `admin.nacional@`, `admin.regional@`, `designador@`, `evaluador@`, `referee@` `rugby.local`.

## Tests

```bash
npm run lint         # eslint
npm run test         # unit (Vitest) — motores puros y parsers
npm run test:rls     # matriz de Row-Level Security por rol/scope (requiere Supabase local)
npm run test:smoke   # flujo de integración designación→aceptación→resultado→evaluación→autoevaluación
npm run build        # build de producción
```

## Documentación

- Diseño: `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md`
- Addendum (cuerpo arbitral, carga de resultado, roadmap): `docs/superpowers/specs/2026-09-10-fichas-cuerpo-arbitral-addendum.md`
- Planes por fase: `docs/superpowers/plans/`
- Estado de fases: `docs/superpowers/ESTADO.md`
- Ficha de partido de referencia: `docs/referencia/formato-partido.pdf`
