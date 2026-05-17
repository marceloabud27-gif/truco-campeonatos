CREATE TABLE IF NOT EXISTS historial_posiciones (
  id SERIAL PRIMARY KEY,
  id_torneo INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  posicion INTEGER NOT NULL CHECK (posicion > 0),
  participante_tipo campeon_tipo NOT NULL,
  participante_id INTEGER NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  detalle VARCHAR(260),
  partidos_jugados INTEGER NOT NULL DEFAULT 0,
  puntos_a_favor INTEGER NOT NULL DEFAULT 0,
  puntos_en_contra INTEGER NOT NULL DEFAULT 0,
  diferencia_puntos INTEGER NOT NULL DEFAULT 0,
  puntos_totales INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_torneo, posicion)
);

CREATE INDEX IF NOT EXISTS idx_historial_posiciones_torneo
  ON historial_posiciones(id_torneo, posicion);
