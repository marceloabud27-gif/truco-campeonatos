ALTER TABLE parejas
  ADD COLUMN IF NOT EXISTS partidos_ganados INTEGER NOT NULL DEFAULT 0 CHECK (partidos_ganados >= 0),
  ADD COLUMN IF NOT EXISTS partidos_perdidos INTEGER NOT NULL DEFAULT 0 CHECK (partidos_perdidos >= 0);

ALTER TABLE jugadores_individuales
  ADD COLUMN IF NOT EXISTS partidos_ganados INTEGER NOT NULL DEFAULT 0 CHECK (partidos_ganados >= 0),
  ADD COLUMN IF NOT EXISTS partidos_perdidos INTEGER NOT NULL DEFAULT 0 CHECK (partidos_perdidos >= 0);

ALTER TABLE historial_posiciones
  ADD COLUMN IF NOT EXISTS partidos_ganados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partidos_perdidos INTEGER NOT NULL DEFAULT 0;
