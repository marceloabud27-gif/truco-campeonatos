CREATE TYPE modalidad_torneo AS ENUM (
  'americano_parejas_fijas',
  'americano_individual',
  'americano_individual_1v1'
);

CREATE TYPE estado_torneo AS ENUM (
  'activo',
  'finalizado'
);

CREATE TYPE estado_partido AS ENUM (
  'pendiente',
  'finalizado'
);

CREATE TYPE campeon_tipo AS ENUM (
  'pareja',
  'jugador_individual'
);

CREATE TABLE usuarios_admin (
  id SERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE torneos (
  id SERIAL PRIMARY KEY,
  nombre_torneo VARCHAR(140) NOT NULL,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin DATE,
  modalidad modalidad_torneo NOT NULL,
  estado estado_torneo NOT NULL DEFAULT 'activo',
  id_campeon INTEGER,
  campeon_tipo campeon_tipo,
  campeon_nombre VARCHAR(160),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (estado = 'activo' AND fecha_fin IS NULL)
    OR
    (estado = 'finalizado' AND fecha_fin IS NOT NULL)
  )
);

CREATE TABLE parejas (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre_equipo VARCHAR(140) NOT NULL,
  jugador_1 VARCHAR(120) NOT NULL,
  jugador_2 VARCHAR(120) NOT NULL,
  partidos_jugados INTEGER NOT NULL DEFAULT 0 CHECK (partidos_jugados >= 0),
  partidos_ganados INTEGER NOT NULL DEFAULT 0 CHECK (partidos_ganados >= 0),
  partidos_perdidos INTEGER NOT NULL DEFAULT 0 CHECK (partidos_perdidos >= 0),
  puntos_totales INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id_torneo, nombre_equipo)
);

CREATE TABLE jugadores_individuales (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  alias VARCHAR(80),
  partidos_jugados INTEGER NOT NULL DEFAULT 0 CHECK (partidos_jugados >= 0),
  partidos_ganados INTEGER NOT NULL DEFAULT 0 CHECK (partidos_ganados >= 0),
  partidos_perdidos INTEGER NOT NULL DEFAULT 0 CHECK (partidos_perdidos >= 0),
  puntos_a_favor INTEGER NOT NULL DEFAULT 0,
  puntos_en_contra INTEGER NOT NULL DEFAULT 0,
  diferencia_puntos INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id_torneo, nombre)
);

CREATE TABLE partidos_parejas (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  id_pareja1 INTEGER NOT NULL REFERENCES parejas(id) ON DELETE CASCADE,
  id_pareja2 INTEGER REFERENCES parejas(id) ON DELETE CASCADE,
  ronda INTEGER NOT NULL CHECK (ronda > 0),
  ganador_id INTEGER REFERENCES parejas(id) ON DELETE SET NULL,
  estado estado_partido NOT NULL DEFAULT 'pendiente',
  es_fecha_libre BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (
    (es_fecha_libre = TRUE AND id_pareja2 IS NULL)
    OR
    (es_fecha_libre = FALSE AND id_pareja2 IS NOT NULL AND id_pareja1 <> id_pareja2)
  )
);

CREATE TABLE partidos_individuales (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  ronda INTEGER NOT NULL CHECK (ronda > 0),
  id_jugador_A INTEGER NOT NULL REFERENCES jugadores_individuales(id) ON DELETE CASCADE,
  id_jugador_B INTEGER NOT NULL REFERENCES jugadores_individuales(id) ON DELETE CASCADE,
  id_jugador_C INTEGER NOT NULL REFERENCES jugadores_individuales(id) ON DELETE CASCADE,
  id_jugador_D INTEGER NOT NULL REFERENCES jugadores_individuales(id) ON DELETE CASCADE,
  puntaje_dupla1 INTEGER CHECK (puntaje_dupla1 BETWEEN 0 AND 40),
  puntaje_dupla2 INTEGER CHECK (puntaje_dupla2 BETWEEN 0 AND 40),
  estado estado_partido NOT NULL DEFAULT 'pendiente',
  CHECK (
    id_jugador_A <> id_jugador_B
    AND id_jugador_A <> id_jugador_C
    AND id_jugador_A <> id_jugador_D
    AND id_jugador_B <> id_jugador_C
    AND id_jugador_B <> id_jugador_D
    AND id_jugador_C <> id_jugador_D
  )
);

CREATE TABLE partidos_individuales_1v1 (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  ronda INTEGER NOT NULL CHECK (ronda > 0),
  id_jugador_1 INTEGER NOT NULL REFERENCES jugadores_individuales(id) ON DELETE CASCADE,
  id_jugador_2 INTEGER REFERENCES jugadores_individuales(id) ON DELETE CASCADE,
  puntaje_jugador_1 INTEGER CHECK (puntaje_jugador_1 BETWEEN 0 AND 40),
  puntaje_jugador_2 INTEGER CHECK (puntaje_jugador_2 BETWEEN 0 AND 40),
  estado estado_partido NOT NULL DEFAULT 'pendiente',
  es_fecha_libre BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (
    (es_fecha_libre = TRUE AND id_jugador_2 IS NULL)
    OR
    (es_fecha_libre = FALSE AND id_jugador_2 IS NOT NULL AND id_jugador_1 <> id_jugador_2)
  )
);

CREATE TABLE historial_posiciones (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  posicion INTEGER NOT NULL CHECK (posicion > 0),
  participante_tipo campeon_tipo NOT NULL,
  participante_id INTEGER NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  detalle VARCHAR(260),
  partidos_jugados INTEGER NOT NULL DEFAULT 0,
  partidos_ganados INTEGER NOT NULL DEFAULT 0,
  partidos_perdidos INTEGER NOT NULL DEFAULT 0,
  puntos_a_favor INTEGER NOT NULL DEFAULT 0,
  puntos_en_contra INTEGER NOT NULL DEFAULT 0,
  diferencia_puntos INTEGER NOT NULL DEFAULT 0,
  puntos_totales INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_torneo, posicion)
);

CREATE INDEX idx_parejas_torneo ON parejas(id_torneo);
CREATE INDEX idx_jugadores_torneo ON jugadores_individuales(id_torneo);
CREATE INDEX idx_partidos_parejas_torneo ON partidos_parejas(id_torneo, ronda);
CREATE INDEX idx_partidos_individuales_torneo ON partidos_individuales(id_torneo, ronda);
CREATE INDEX idx_partidos_individuales_1v1_torneo ON partidos_individuales_1v1(id_torneo, ronda);
CREATE INDEX idx_torneos_estado ON torneos(estado);
CREATE INDEX idx_historial_posiciones_torneo ON historial_posiciones(id_torneo, posicion);
