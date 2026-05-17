# Deploy gratis: Render + Neon

## 1. Base de datos en Neon

1. Crear un proyecto gratis en Neon.
2. Copiar el connection string de PostgreSQL.
3. En el SQL Editor de Neon, ejecutar `database/schema.sql`.
4. Guardar el connection string para `DATABASE_URL`.

## 2. App en Render

1. Subir este proyecto a GitHub.
2. En Render, crear un Web Service desde el repo.
3. Usar:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/healthz`
4. Configurar variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `NODE_ENV=production`

## 3. Crear admin en produccion

Desde una terminal con el `DATABASE_URL` de Neon configurado:

```bash
npm run create-admin -- admin TU_PASSWORD
```

## Regla publica

Compartir siempre el enlace con `?public=fixture`. Esa vista muestra solo fixture: ronda, mesa y participantes.
