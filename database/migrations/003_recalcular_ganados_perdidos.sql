UPDATE parejas
   SET partidos_ganados = 0,
       partidos_perdidos = 0;

WITH ganados AS (
  SELECT ganador_id AS id, COUNT(*) AS total
    FROM partidos_parejas
   WHERE estado = 'finalizado'
     AND ganador_id IS NOT NULL
   GROUP BY ganador_id
)
UPDATE parejas p
   SET partidos_ganados = ganados.total
  FROM ganados
 WHERE p.id = ganados.id;

WITH perdidos AS (
  SELECT CASE
           WHEN ganador_id = id_pareja1 THEN id_pareja2
           ELSE id_pareja1
         END AS id,
         COUNT(*) AS total
    FROM partidos_parejas
   WHERE estado = 'finalizado'
     AND ganador_id IS NOT NULL
     AND es_fecha_libre = FALSE
   GROUP BY 1
)
UPDATE parejas p
   SET partidos_perdidos = perdidos.total
  FROM perdidos
 WHERE p.id = perdidos.id;

UPDATE jugadores_individuales
   SET partidos_ganados = 0,
       partidos_perdidos = 0;

WITH ganadores AS (
  SELECT UNNEST(ARRAY[id_jugador_A, id_jugador_B]) AS id
    FROM partidos_individuales
   WHERE estado = 'finalizado'
     AND puntaje_dupla1 > puntaje_dupla2
  UNION ALL
  SELECT UNNEST(ARRAY[id_jugador_C, id_jugador_D]) AS id
    FROM partidos_individuales
   WHERE estado = 'finalizado'
     AND puntaje_dupla2 > puntaje_dupla1
),
conteo AS (
  SELECT id, COUNT(*) AS total
    FROM ganadores
   GROUP BY id
)
UPDATE jugadores_individuales j
   SET partidos_ganados = conteo.total
  FROM conteo
 WHERE j.id = conteo.id;

WITH perdedores AS (
  SELECT UNNEST(ARRAY[id_jugador_C, id_jugador_D]) AS id
    FROM partidos_individuales
   WHERE estado = 'finalizado'
     AND puntaje_dupla1 > puntaje_dupla2
  UNION ALL
  SELECT UNNEST(ARRAY[id_jugador_A, id_jugador_B]) AS id
    FROM partidos_individuales
   WHERE estado = 'finalizado'
     AND puntaje_dupla2 > puntaje_dupla1
),
conteo AS (
  SELECT id, COUNT(*) AS total
    FROM perdedores
   GROUP BY id
)
UPDATE jugadores_individuales j
   SET partidos_perdidos = conteo.total
  FROM conteo
 WHERE j.id = conteo.id;
