# Truco Campeonatos

Web app mobile-first para administrar campeonatos de Truco en modo publico/admin.

## Estructura

- `database/schema.sql`: esquema PostgreSQL con torneos historicos, roles, participantes y partidos.
- `src/`: API Express, middleware JWT, controladores y algoritmos de fixture.
- `public/`: interfaz HTML/CSS/JS con modo oscuro y navegacion inferior.

## Puesta en marcha

1. Crear una base PostgreSQL y ejecutar `database/schema.sql`.
2. Copiar `.env.example` a `.env` y ajustar `DATABASE_URL` y `JWT_SECRET`.
3. Instalar dependencias:

```bash
npm install
```

4. Crear un administrador:

```bash
npm run create-admin -- admin tu_password
```

5. Iniciar la app:

```bash
npm run dev
```

La web queda disponible en `http://localhost:3000`.

## Formato de carga rapida

Parejas fijas: desde 5 parejas. Una pareja por linea, separada por comas.

```text
Equipo Norte, Ana, Luis
Equipo Sur, Marta, Jose
```

Individual: desde 7 jugadores. Un jugador por linea; alias opcional. Cada partido se carga como 2 vs 2 y ambos lados suman sus puntos reales, por ejemplo 18 a 9. El desempate es por menor cantidad de puntos recibidos.

```text
Ana, La Zurda
Luis
Marta
Jose
```
