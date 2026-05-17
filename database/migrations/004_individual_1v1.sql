ALTER TYPE modalidad_torneo ADD VALUE IF NOT EXISTS 'americano_individual_1v1';

CREATE TABLE IF NOT EXISTS partidos_individuales_1v1 (
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

CREATE INDEX IF NOT EXISTS idx_partidos_individuales_1v1_torneo
  ON partidos_individuales_1v1(id_torneo, ronda);
