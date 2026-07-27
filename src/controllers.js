const db = require('./db');
const os = require('os');
const {
  generarRoundRobinParejas,
  generarRotacionIndividual,
  generarRoundRobinIndividual1v1,
} = require('./fixtures');

const VALID_MODALIDADES = new Set(['americano_parejas_fijas', 'americano_individual', 'americano_individual_1v1']);
const MIN_PAREJAS_FIJAS = 4;
const PUNTAJE_PAREJAS_EXPRESS = 18;
const PUNTOS_VICTORIA_PAREJAS = 3;
const MIN_JUGADORES_INDIVIDUAL = 7;
const MIN_JUGADORES_1V1 = 2;

function assertScore(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 40) {
    const error = new Error(`${label} debe ser un entero entre 0 y 40.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function assertModalidad(modalidad) {
  if (!VALID_MODALIDADES.has(modalidad)) {
    const error = new Error('Modalidad invalida.');
    error.statusCode = 400;
    throw error;
  }
}

function assertUniqueNames(values, label) {
  const seen = new Set();
  for (const value of values) {
    const normalized = String(value || '').trim().toLocaleLowerCase('es');
    if (seen.has(normalized)) {
      const error = new Error(`Hay un ${label} repetido: "${value}". Usa un apellido o apodo para diferenciarlo.`);
      error.statusCode = 400;
      throw error;
    }
    seen.add(normalized);
  }
}

async function listarTorneos(req, res, next) {
  try {
    const { estado } = req.query;
    const params = [];
    let where = '';

    if (estado) {
      params.push(estado);
      where = 'WHERE estado = $1';
    }

    const result = await db.query(
      `SELECT id, nombre_torneo, fecha_inicio, fecha_fin, modalidad, estado, id_campeon,
              campeon_tipo, campeon_nombre
         FROM torneos
         ${where}
        ORDER BY fecha_inicio DESC, id DESC`,
      params
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
}

function obtenerInfoCompartir(req, res) {
  const interfaces = os.networkInterfaces();
  const addresses = Object.values(interfaces)
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
  const host = addresses[0] || req.hostname;
  const port = req.app.get('port') || process.env.PORT || 3000;

  return res.json({
    local_url: `http://${host}:${port}`,
  });
}

function participantePublico(torneo, participante) {
  if (torneo.modalidad === 'americano_parejas_fijas') {
    return {
      id: participante.id,
      nombre_equipo: participante.nombre_equipo,
      jugador_1: participante.jugador_1,
      jugador_2: participante.jugador_2,
    };
  }

  return {
    id: participante.id,
    nombre: participante.nombre,
    alias: participante.alias,
  };
}

function partidoPublico(torneo, partido) {
  if (torneo.modalidad === 'americano_parejas_fijas') {
    return {
      id: partido.id,
      ronda: partido.ronda,
      estado: partido.estado,
      es_fecha_libre: partido.es_fecha_libre,
      pareja1: partido.pareja1,
      pareja2: partido.pareja2,
    };
  }

  if (torneo.modalidad === 'americano_individual_1v1') {
    return {
      id: partido.id,
      ronda: partido.ronda,
      estado: partido.estado,
      es_fecha_libre: partido.es_fecha_libre,
      id_jugador_1: partido.id_jugador_1,
      id_jugador_2: partido.id_jugador_2,
      jugador_1: partido.jugador_1,
      jugador_2: partido.jugador_2,
    };
  }

  return {
    id: partido.id,
    ronda: partido.ronda,
    estado: partido.estado,
    id_jugador_a: partido.id_jugador_a,
    id_jugador_b: partido.id_jugador_b,
    id_jugador_c: partido.id_jugador_c,
    id_jugador_d: partido.id_jugador_d,
    jugador_a: partido.jugador_a,
    jugador_b: partido.jugador_b,
    jugador_c: partido.jugador_c,
    jugador_d: partido.jugador_d,
  };
}

function assertPairScore(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > PUNTAJE_PAREJAS_EXPRESS) {
    const error = new Error(`${label} debe ser un entero entre 0 y ${PUNTAJE_PAREJAS_EXPRESS}.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function responderDetalleTorneo(req, res, detail) {
  if (req.admin) {
    return res.json(detail);
  }

  return res.json({
    torneo: detail.torneo,
    participantes: detail.participantes.map((participante) => participantePublico(detail.torneo, participante)),
    partidos: detail.partidos.map((partido) => partidoPublico(detail.torneo, partido)),
  });
}

async function listarHistorial(req, res, next) {
  try {
    const torneosResult = await db.query(
      `SELECT id, nombre_torneo, fecha_inicio, fecha_fin, modalidad, estado, id_campeon,
              campeon_tipo, campeon_nombre
         FROM torneos
        WHERE estado = 'finalizado'
        ORDER BY fecha_fin DESC, id DESC`
    );

    const ids = torneosResult.rows.map((torneo) => torneo.id);
    if (!ids.length) {
      return res.json([]);
    }

    const posicionesResult = await db.query(
      `SELECT *
         FROM historial_posiciones
        WHERE id_torneo = ANY($1::int[])
        ORDER BY id_torneo, posicion`,
      [ids]
    );

    const posicionesPorTorneo = posicionesResult.rows.reduce((map, posicion) => {
      map[posicion.id_torneo] ||= [];
      map[posicion.id_torneo].push(posicion);
      return map;
    }, {});

    return res.json(torneosResult.rows.map((torneo) => ({
      ...torneo,
      posiciones: posicionesPorTorneo[torneo.id] || [],
    })));
  } catch (error) {
    return next(error);
  }
}

async function exportarBackup(req, res, next) {
  try {
    const [
      torneos,
      parejas,
      jugadores,
      partidosParejas,
      partidosIndividuales,
      partidosIndividuales1v1,
      historialPosiciones,
    ] = await Promise.all([
      db.query('SELECT * FROM torneos ORDER BY id'),
      db.query('SELECT * FROM parejas ORDER BY id_torneo, id'),
      db.query('SELECT * FROM jugadores_individuales ORDER BY id_torneo, id'),
      db.query('SELECT * FROM partidos_parejas ORDER BY id_torneo, ronda, id'),
      db.query('SELECT * FROM partidos_individuales ORDER BY id_torneo, ronda, id'),
      db.query('SELECT * FROM partidos_individuales_1v1 ORDER BY id_torneo, ronda, id'),
      db.query('SELECT * FROM historial_posiciones ORDER BY id_torneo, posicion'),
    ]);

    return res.json({
      generado_en: new Date().toISOString(),
      torneos: torneos.rows,
      parejas: parejas.rows,
      jugadores_individuales: jugadores.rows,
      partidos_parejas: partidosParejas.rows,
      partidos_individuales: partidosIndividuales.rows,
      partidos_individuales_1v1: partidosIndividuales1v1.rows,
      historial_posiciones: historialPosiciones.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function obtenerTorneo(req, res, next) {
  try {
    const idTorneo = Number(req.params.id);
    const torneoResult = await db.query('SELECT * FROM torneos WHERE id = $1', [idTorneo]);
    const torneo = torneoResult.rows[0];

    if (!torneo) {
      return res.status(404).json({ message: 'Torneo no encontrado.' });
    }

    if (torneo.modalidad === 'americano_parejas_fijas') {
      const [participantes, partidos] = await Promise.all([
        db.query(
          `SELECT *
             FROM parejas
            WHERE id_torneo = $1
            ORDER BY nombre_equipo ASC`,
          [idTorneo]
        ),
        db.query(
          `SELECT pp.*, p1.nombre_equipo AS pareja1, p2.nombre_equipo AS pareja2,
                  pg.nombre_equipo AS ganador
             FROM partidos_parejas pp
             JOIN parejas p1 ON p1.id = pp.id_pareja1
        LEFT JOIN parejas p2 ON p2.id = pp.id_pareja2
        LEFT JOIN parejas pg ON pg.id = pp.ganador_id
            WHERE pp.id_torneo = $1
            ORDER BY pp.ronda, pp.id`,
          [idTorneo]
        ),
      ]);
      return responderDetalleTorneo(req, res, {
        torneo,
        participantes: ordenarParejas(participantes.rows, partidos.rows),
        partidos: partidos.rows,
      });
    }

    if (torneo.modalidad === 'americano_individual_1v1') {
      const [participantes, partidos] = await Promise.all([
        db.query(
          `SELECT *
             FROM jugadores_individuales
            WHERE id_torneo = $1
            ORDER BY nombre ASC`,
          [idTorneo]
        ),
        db.query(
          `SELECT pi.*,
                  j1.nombre AS jugador_1,
                  j2.nombre AS jugador_2
             FROM partidos_individuales_1v1 pi
             JOIN jugadores_individuales j1 ON j1.id = pi.id_jugador_1
        LEFT JOIN jugadores_individuales j2 ON j2.id = pi.id_jugador_2
            WHERE pi.id_torneo = $1
            ORDER BY pi.ronda, pi.id`,
          [idTorneo]
        ),
      ]);

      return responderDetalleTorneo(req, res, {
        torneo,
        participantes: ordenarJugadoresIndividuales(participantes.rows, partidos.rows),
        partidos: partidos.rows,
      });
    }

    const [participantes, partidos] = await Promise.all([
      db.query(
        `SELECT *
           FROM jugadores_individuales
          WHERE id_torneo = $1
          ORDER BY nombre ASC`,
        [idTorneo]
      ),
      db.query(
        `SELECT pi.*,
                ja.nombre AS jugador_a, jb.nombre AS jugador_b,
                jc.nombre AS jugador_c, jd.nombre AS jugador_d
           FROM partidos_individuales pi
           JOIN jugadores_individuales ja ON ja.id = pi.id_jugador_A
           JOIN jugadores_individuales jb ON jb.id = pi.id_jugador_B
           JOIN jugadores_individuales jc ON jc.id = pi.id_jugador_C
           JOIN jugadores_individuales jd ON jd.id = pi.id_jugador_D
          WHERE pi.id_torneo = $1
          ORDER BY pi.ronda, pi.id`,
        [idTorneo]
      ),
    ]);

    return responderDetalleTorneo(req, res, {
      torneo,
      participantes: ordenarJugadoresIndividuales(participantes.rows, partidos.rows),
      partidos: partidos.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function crearTorneo(req, res, next) {
  try {
    const { nombre_torneo, modalidad, fecha_inicio, parejas = [], jugadores = [] } = req.body;
    assertModalidad(modalidad);

    if (!nombre_torneo) {
      return res.status(400).json({ message: 'El nombre del torneo es obligatorio.' });
    }

    const torneo = await db.withTransaction(async (client) => {
      const torneoResult = await client.query(
        `INSERT INTO torneos (nombre_torneo, modalidad, fecha_inicio)
         VALUES ($1, $2, COALESCE($3, CURRENT_DATE))
         RETURNING *`,
        [nombre_torneo, modalidad, fecha_inicio || null]
      );
      const nuevoTorneo = torneoResult.rows[0];

      if (modalidad === 'americano_parejas_fijas') {
        if (parejas.length < MIN_PAREJAS_FIJAS) {
          const error = new Error(`Se requieren al menos ${MIN_PAREJAS_FIJAS} parejas.`);
          error.statusCode = 400;
          throw error;
        }
        assertUniqueNames(parejas.map((pareja) => pareja.nombre_equipo), 'equipo');
        for (const pareja of parejas) {
          await client.query(
            `INSERT INTO parejas (id_torneo, nombre_equipo, jugador_1, jugador_2)
             VALUES ($1, $2, $3, $4)`,
            [nuevoTorneo.id, pareja.nombre_equipo, pareja.jugador_1, pareja.jugador_2]
          );
        }
      } else {
        const minJugadores = modalidad === 'americano_individual_1v1'
          ? MIN_JUGADORES_1V1
          : MIN_JUGADORES_INDIVIDUAL;
        if (jugadores.length < minJugadores) {
          const error = new Error(`Se requieren al menos ${minJugadores} jugadores.`);
          error.statusCode = 400;
          throw error;
        }
        assertUniqueNames(jugadores.map((jugador) => jugador.nombre), 'jugador');
        for (const jugador of jugadores) {
          await client.query(
            `INSERT INTO jugadores_individuales (id_torneo, nombre, alias)
             VALUES ($1, $2, $3)`,
            [nuevoTorneo.id, jugador.nombre, jugador.alias || null]
          );
        }
      }

      return nuevoTorneo;
    });

    return res.status(201).json(torneo);
  } catch (error) {
    return next(error);
  }
}

async function generarFixture(req, res, next) {
  try {
    const idTorneo = Number(req.params.id);
    const fixture = await db.withTransaction(async (client) => {
      const torneoResult = await client.query('SELECT * FROM torneos WHERE id = $1 FOR UPDATE', [idTorneo]);
      const torneo = torneoResult.rows[0];
      if (!torneo) {
        const error = new Error('Torneo no encontrado.');
        error.statusCode = 404;
        throw error;
      }
      if (torneo.estado !== 'activo') {
        const error = new Error('No se puede generar fixture en un torneo finalizado.');
        error.statusCode = 409;
        throw error;
      }

      if (torneo.modalidad === 'americano_parejas_fijas') {
        await client.query('DELETE FROM partidos_parejas WHERE id_torneo = $1', [idTorneo]);
        await client.query(
          `UPDATE parejas
              SET partidos_jugados = 0,
                  partidos_ganados = 0,
                  partidos_perdidos = 0,
                  puntos_totales = 0,
                  puntos_a_favor = 0,
                  puntos_en_contra = 0,
                  diferencia_puntos = 0
            WHERE id_torneo = $1`,
          [idTorneo]
        );
        const parejasResult = await client.query('SELECT id, nombre_equipo FROM parejas WHERE id_torneo = $1 ORDER BY id', [idTorneo]);
        const partidos = generarRoundRobinParejas(parejasResult.rows);
        for (const partido of partidos) {
          await client.query(
            `INSERT INTO partidos_parejas (id_torneo, id_pareja1, id_pareja2, ronda, es_fecha_libre)
             VALUES ($1, $2, $3, $4, $5)`,
            [idTorneo, partido.id_pareja1, partido.id_pareja2, partido.ronda, partido.es_fecha_libre]
          );
        }
        return partidos;
      }

      if (torneo.modalidad === 'americano_individual_1v1') {
        await client.query('DELETE FROM partidos_individuales_1v1 WHERE id_torneo = $1', [idTorneo]);
        const jugadoresResult = await client.query('SELECT id, nombre FROM jugadores_individuales WHERE id_torneo = $1 ORDER BY id', [idTorneo]);
        const partidos = generarRoundRobinIndividual1v1(jugadoresResult.rows);
        for (const partido of partidos) {
          await client.query(
            `INSERT INTO partidos_individuales_1v1
             (id_torneo, ronda, id_jugador_1, id_jugador_2, es_fecha_libre)
             VALUES ($1, $2, $3, $4, $5)`,
            [idTorneo, partido.ronda, partido.id_jugador_1, partido.id_jugador_2, partido.es_fecha_libre]
          );
        }
        return partidos;
      }

      await client.query('DELETE FROM partidos_individuales WHERE id_torneo = $1', [idTorneo]);
      const jugadoresResult = await client.query('SELECT id, nombre FROM jugadores_individuales WHERE id_torneo = $1 ORDER BY id', [idTorneo]);
      const partidos = generarRotacionIndividual(jugadoresResult.rows);
      for (const partido of partidos) {
        await client.query(
          `INSERT INTO partidos_individuales
           (id_torneo, ronda, id_jugador_A, id_jugador_B, id_jugador_C, id_jugador_D)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [idTorneo, partido.ronda, partido.id_jugador_A, partido.id_jugador_B, partido.id_jugador_C, partido.id_jugador_D]
        );
      }
      return partidos;
    });

    return res.status(201).json({ partidos_creados: fixture.length });
  } catch (error) {
    return next(error);
  }
}

async function cargarResultadoParejas(req, res, next) {
  try {
    const idPartido = Number(req.params.id);
    const puntajePareja1 = assertPairScore(req.body.puntaje_pareja1, 'puntaje_pareja1');
    const puntajePareja2 = assertPairScore(req.body.puntaje_pareja2, 'puntaje_pareja2');

    if (puntajePareja1 === puntajePareja2) {
      const error = new Error('No se permiten empates en parejas. Carga un ganador.');
      error.statusCode = 400;
      throw error;
    }
    if (Math.max(puntajePareja1, puntajePareja2) !== PUNTAJE_PAREJAS_EXPRESS) {
      const error = new Error(`El ganador debe llegar a ${PUNTAJE_PAREJAS_EXPRESS} puntos.`);
      error.statusCode = 400;
      throw error;
    }

    const partido = await db.withTransaction(async (client) => {
      const partidoResult = await client.query('SELECT * FROM partidos_parejas WHERE id = $1 FOR UPDATE', [idPartido]);
      const actual = partidoResult.rows[0];
      if (!actual) {
        const error = new Error('Partido no encontrado.');
        error.statusCode = 404;
        throw error;
      }
      if (actual.es_fecha_libre) {
        const error = new Error('Una fecha libre no admite resultado.');
        error.statusCode = 400;
        throw error;
      }

      if (actual.estado === 'finalizado' && actual.ganador_id) {
        const perdedorAnterior = actual.ganador_id === actual.id_pareja1 ? actual.id_pareja2 : actual.id_pareja1;
        const puntosVictoriaAnterior = actual.puntaje_pareja1 == null || actual.puntaje_pareja2 == null
          ? 1
          : PUNTOS_VICTORIA_PAREJAS;
        await client.query(
          `UPDATE parejas
              SET puntos_totales = puntos_totales - $1,
                  partidos_ganados = partidos_ganados - 1
            WHERE id = $2`,
          [puntosVictoriaAnterior, actual.ganador_id]
        );
        await client.query(
          'UPDATE parejas SET partidos_perdidos = partidos_perdidos - 1 WHERE id = $1',
          [perdedorAnterior]
        );
        await aplicarDeltaPareja(client, actual.id_pareja1, -(actual.puntaje_pareja1 || 0), -(actual.puntaje_pareja2 || 0));
        await aplicarDeltaPareja(client, actual.id_pareja2, -(actual.puntaje_pareja2 || 0), -(actual.puntaje_pareja1 || 0));
      } else {
        await client.query(
          'UPDATE parejas SET partidos_jugados = partidos_jugados + 1 WHERE id IN ($1, $2)',
          [actual.id_pareja1, actual.id_pareja2]
        );
      }

      const ganadorId = puntajePareja1 > puntajePareja2 ? actual.id_pareja1 : actual.id_pareja2;
      const perdedorId = ganadorId === actual.id_pareja1 ? actual.id_pareja2 : actual.id_pareja1;
      await client.query(
        `UPDATE parejas
            SET puntos_totales = puntos_totales + $1,
                partidos_ganados = partidos_ganados + 1
          WHERE id = $2`,
        [PUNTOS_VICTORIA_PAREJAS, ganadorId]
      );
      await client.query(
        'UPDATE parejas SET partidos_perdidos = partidos_perdidos + 1 WHERE id = $1',
        [perdedorId]
      );
      await aplicarDeltaPareja(client, actual.id_pareja1, puntajePareja1, puntajePareja2);
      await aplicarDeltaPareja(client, actual.id_pareja2, puntajePareja2, puntajePareja1);

      const updated = await client.query(
        `UPDATE partidos_parejas
            SET ganador_id = $1,
                puntaje_pareja1 = $2,
                puntaje_pareja2 = $3,
                estado = 'finalizado'
          WHERE id = $4
          RETURNING *`,
        [ganadorId, puntajePareja1, puntajePareja2, idPartido]
      );
      return updated.rows[0];
    });

    return res.json(partido);
  } catch (error) {
    return next(error);
  }
}

async function cargarResultadoIndividual(req, res, next) {
  try {
    const idPartido = Number(req.params.id);
    const puntajeDupla1 = assertScore(req.body.puntaje_dupla1, 'puntaje_dupla1');
    const puntajeDupla2 = assertScore(req.body.puntaje_dupla2, 'puntaje_dupla2');

    const partido = await db.withTransaction(async (client) => {
      const partidoResult = await client.query('SELECT * FROM partidos_individuales WHERE id = $1 FOR UPDATE', [idPartido]);
      const actual = partidoResult.rows[0];
      if (!actual) {
        const error = new Error('Partido no encontrado.');
        error.statusCode = 404;
        throw error;
      }

      const dupla1 = [actual.id_jugador_a, actual.id_jugador_b];
      const dupla2 = [actual.id_jugador_c, actual.id_jugador_d];

      if (actual.estado === 'finalizado') {
        await aplicarDeltaIndividual(client, dupla1, -actual.puntaje_dupla1, -actual.puntaje_dupla2);
        await aplicarDeltaIndividual(client, dupla2, -actual.puntaje_dupla2, -actual.puntaje_dupla1);
        await aplicarResultadoIndividual(client, dupla1, dupla2, actual.puntaje_dupla1, actual.puntaje_dupla2, -1);
      } else {
        await aplicarPartidoJugado(client, [...dupla1, ...dupla2]);
      }

      await aplicarDeltaIndividual(client, dupla1, puntajeDupla1, puntajeDupla2);
      await aplicarDeltaIndividual(client, dupla2, puntajeDupla2, puntajeDupla1);
      await aplicarResultadoIndividual(client, dupla1, dupla2, puntajeDupla1, puntajeDupla2, 1);

      const updated = await client.query(
        `UPDATE partidos_individuales
            SET puntaje_dupla1 = $1,
                puntaje_dupla2 = $2,
                estado = 'finalizado'
          WHERE id = $3
          RETURNING *`,
        [puntajeDupla1, puntajeDupla2, idPartido]
      );

      return updated.rows[0];
    });

    return res.json(partido);
  } catch (error) {
    return next(error);
  }
}

async function aplicarDeltaPareja(client, parejaId, puntosFavor, puntosContra) {
  await client.query(
    `UPDATE parejas
        SET puntos_a_favor = puntos_a_favor + $1,
            puntos_en_contra = puntos_en_contra + $2,
            diferencia_puntos = diferencia_puntos + $3
      WHERE id = $4`,
    [puntosFavor, puntosContra, puntosFavor - puntosContra, parejaId]
  );
}

async function cargarResultadoIndividual1v1(req, res, next) {
  try {
    const idPartido = Number(req.params.id);
    const puntajeJugador1 = assertScore(req.body.puntaje_jugador_1, 'puntaje_jugador_1');
    const puntajeJugador2 = assertScore(req.body.puntaje_jugador_2, 'puntaje_jugador_2');

    const partido = await db.withTransaction(async (client) => {
      const partidoResult = await client.query('SELECT * FROM partidos_individuales_1v1 WHERE id = $1 FOR UPDATE', [idPartido]);
      const actual = partidoResult.rows[0];
      if (!actual) {
        const error = new Error('Partido no encontrado.');
        error.statusCode = 404;
        throw error;
      }
      if (actual.es_fecha_libre) {
        const error = new Error('Una fecha libre no admite resultado.');
        error.statusCode = 400;
        throw error;
      }

      const jugador1 = [actual.id_jugador_1];
      const jugador2 = [actual.id_jugador_2];

      if (actual.estado === 'finalizado') {
        await aplicarDeltaIndividual(client, jugador1, -actual.puntaje_jugador_1, -actual.puntaje_jugador_2);
        await aplicarDeltaIndividual(client, jugador2, -actual.puntaje_jugador_2, -actual.puntaje_jugador_1);
        await aplicarResultadoIndividual(client, jugador1, jugador2, actual.puntaje_jugador_1, actual.puntaje_jugador_2, -1);
      } else {
        await aplicarPartidoJugado(client, [actual.id_jugador_1, actual.id_jugador_2]);
      }

      await aplicarDeltaIndividual(client, jugador1, puntajeJugador1, puntajeJugador2);
      await aplicarDeltaIndividual(client, jugador2, puntajeJugador2, puntajeJugador1);
      await aplicarResultadoIndividual(client, jugador1, jugador2, puntajeJugador1, puntajeJugador2, 1);

      const updated = await client.query(
        `UPDATE partidos_individuales_1v1
            SET puntaje_jugador_1 = $1,
                puntaje_jugador_2 = $2,
                estado = 'finalizado'
          WHERE id = $3
          RETURNING *`,
        [puntajeJugador1, puntajeJugador2, idPartido]
      );

      return updated.rows[0];
    });

    return res.json(partido);
  } catch (error) {
    return next(error);
  }
}

async function aplicarPartidoJugado(client, jugadoresIds) {
  await client.query(
    'UPDATE jugadores_individuales SET partidos_jugados = partidos_jugados + 1 WHERE id = ANY($1::int[])',
    [jugadoresIds]
  );
}

async function aplicarDeltaIndividual(client, jugadoresIds, puntosFavor, puntosContra) {
  await client.query(
    `UPDATE jugadores_individuales
        SET puntos_a_favor = puntos_a_favor + $1,
            puntos_en_contra = puntos_en_contra + $2,
            diferencia_puntos = diferencia_puntos + $3
      WHERE id = ANY($4::int[])`,
    [puntosFavor, puntosContra, puntosFavor - puntosContra, jugadoresIds]
  );
}

async function aplicarResultadoIndividual(client, dupla1, dupla2, puntajeDupla1, puntajeDupla2, factor) {
  if (puntajeDupla1 === puntajeDupla2) {
    return;
  }

  const ganadores = puntajeDupla1 > puntajeDupla2 ? dupla1 : dupla2;
  const perdedores = puntajeDupla1 > puntajeDupla2 ? dupla2 : dupla1;

  await client.query(
    `UPDATE jugadores_individuales
        SET partidos_ganados = partidos_ganados + $1
      WHERE id = ANY($2::int[])`,
    [factor, ganadores]
  );
  await client.query(
    `UPDATE jugadores_individuales
        SET partidos_perdidos = partidos_perdidos + $1
      WHERE id = ANY($2::int[])`,
    [factor, perdedores]
  );
}

async function finalizarTorneo(req, res, next) {
  try {
    const idTorneo = Number(req.params.id);
    const resultado = await db.withTransaction(async (client) => {
      const torneoResult = await client.query('SELECT * FROM torneos WHERE id = $1 FOR UPDATE', [idTorneo]);
      const torneo = torneoResult.rows[0];
      if (!torneo) {
        const error = new Error('Torneo no encontrado.');
        error.statusCode = 404;
        throw error;
      }

      if (torneo.modalidad === 'americano_parejas_fijas') {
        const parejasResult = await client.query(
          `SELECT *
             FROM parejas
            WHERE id_torneo = $1
            ORDER BY nombre_equipo ASC`,
          [idTorneo]
        );
        const partidosResult = await client.query(
          `SELECT *
             FROM partidos_parejas
            WHERE id_torneo = $1
            ORDER BY ronda, id`,
          [idTorneo]
        );
        const campeon = ordenarParejas(parejasResult.rows, partidosResult.rows)[0];
        await guardarHistorialPosiciones(client, torneo);
        return cerrarConCampeon(
          client,
          idTorneo,
          campeon ? { id: campeon.id, nombre: campeon.nombre_equipo } : null,
          'pareja'
        );
      }

      const campeonResult = await client.query(
        `SELECT *
           FROM jugadores_individuales
          WHERE id_torneo = $1
          ORDER BY nombre ASC`,
        [idTorneo]
      );
      const partidosTable = torneo.modalidad === 'americano_individual_1v1'
        ? 'partidos_individuales_1v1'
        : 'partidos_individuales';
      const partidosResult = await client.query(
        `SELECT *
           FROM ${partidosTable}
          WHERE id_torneo = $1
          ORDER BY ronda, id`,
        [idTorneo]
      );
      const posiciones = ordenarJugadoresIndividuales(campeonResult.rows, partidosResult.rows);
      const campeon = posiciones[0]
        ? { id: posiciones[0].id, nombre: posiciones[0].alias || posiciones[0].nombre }
        : null;
      await guardarHistorialPosiciones(client, torneo);
      return cerrarConCampeon(client, idTorneo, campeon, 'jugador_individual');
    });

    return res.json(resultado);
  } catch (error) {
    return next(error);
  }
}

async function guardarHistorialPosiciones(client, torneo) {
  await client.query('DELETE FROM historial_posiciones WHERE id_torneo = $1', [torneo.id]);

  if (torneo.modalidad === 'americano_parejas_fijas') {
    const [posiciones, partidos] = await Promise.all([
      client.query(
      `SELECT id, nombre_equipo, jugador_1, jugador_2, partidos_jugados,
              partidos_ganados, partidos_perdidos, puntos_totales,
              puntos_a_favor, puntos_en_contra, diferencia_puntos
         FROM parejas
        WHERE id_torneo = $1
        ORDER BY nombre_equipo ASC`,
      [torneo.id]
      ),
      client.query(
      `SELECT *
         FROM partidos_parejas
        WHERE id_torneo = $1
        ORDER BY ronda, id`,
      [torneo.id]
      ),
    ]);

    for (const [index, item] of ordenarParejas(posiciones.rows, partidos.rows).entries()) {
      await client.query(
        `INSERT INTO historial_posiciones
         (id_torneo, posicion, participante_tipo, participante_id, nombre, detalle,
          partidos_jugados, partidos_ganados, partidos_perdidos, puntos_totales,
          puntos_a_favor, puntos_en_contra, diferencia_puntos)
         VALUES ($1, $2, 'pareja', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          torneo.id,
          index + 1,
          item.id,
          item.nombre_equipo,
          `${item.jugador_1} / ${item.jugador_2}`,
          item.partidos_jugados,
          item.partidos_ganados,
          item.partidos_perdidos,
          item.puntos_totales,
          item.puntos_a_favor,
          item.puntos_en_contra,
          item.diferencia_puntos,
        ]
      );
    }
    return;
  }

  const posiciones = await client.query(
    `SELECT id, nombre, alias, partidos_jugados, partidos_ganados, partidos_perdidos,
            puntos_a_favor, puntos_en_contra, diferencia_puntos
       FROM jugadores_individuales
      WHERE id_torneo = $1
      ORDER BY nombre ASC`,
    [torneo.id]
  );
  const partidosTable = torneo.modalidad === 'americano_individual_1v1'
    ? 'partidos_individuales_1v1'
    : 'partidos_individuales';
  const partidos = await client.query(
    `SELECT *
       FROM ${partidosTable}
      WHERE id_torneo = $1
      ORDER BY ronda, id`,
    [torneo.id]
  );

  for (const [index, item] of ordenarJugadoresIndividuales(posiciones.rows, partidos.rows).entries()) {
    await client.query(
      `INSERT INTO historial_posiciones
       (id_torneo, posicion, participante_tipo, participante_id, nombre, detalle,
        partidos_jugados, partidos_ganados, partidos_perdidos, puntos_a_favor,
        puntos_en_contra, diferencia_puntos)
       VALUES ($1, $2, 'jugador_individual', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        torneo.id,
        index + 1,
        item.id,
        item.nombre,
        item.alias,
        item.partidos_jugados,
        item.partidos_ganados,
        item.partidos_perdidos,
        item.puntos_a_favor,
        item.puntos_en_contra,
        item.diferencia_puntos,
      ]
    );
  }
}

function ordenarParejas(parejas, partidos) {
  return [...parejas].sort((a, b) => (
    b.puntos_totales - a.puntos_totales
    || b.diferencia_puntos - a.diferencia_puntos
    || b.puntos_a_favor - a.puntos_a_favor
    || compararEnfrentamientoDirectoParejas(a.id, b.id, partidos)
    || b.partidos_ganados - a.partidos_ganados
    || a.partidos_perdidos - b.partidos_perdidos
    || a.nombre_equipo.localeCompare(b.nombre_equipo)
  ));
}

function compararEnfrentamientoDirectoParejas(idA, idB, partidos) {
  const directo = partidos.find((partido) => (
    partido.estado === 'finalizado'
    && !partido.es_fecha_libre
    && (
      (partido.id_pareja1 === idA && partido.id_pareja2 === idB)
      || (partido.id_pareja1 === idB && partido.id_pareja2 === idA)
    )
  ));

  if (!directo) {
    return 0;
  }

  if (directo.ganador_id === idA) {
    return -1;
  }
  if (directo.ganador_id === idB) {
    return 1;
  }
  return 0;
}

function ordenarJugadoresIndividuales(jugadores, partidos) {
  return [...jugadores].sort((a, b) => {
    const base = (
      b.puntos_a_favor - a.puntos_a_favor
      || a.puntos_en_contra - b.puntos_en_contra
    );
    if (base !== 0) {
      return base;
    }

    const directo = compararEnfrentamientoDirecto(a.id, b.id, partidos);
    if (directo !== 0) {
      return directo;
    }

    return (
      b.partidos_ganados - a.partidos_ganados
      || a.partidos_perdidos - b.partidos_perdidos
      || b.diferencia_puntos - a.diferencia_puntos
      || a.nombre.localeCompare(b.nombre)
    );
  });
}

function compararEnfrentamientoDirecto(idA, idB, partidos) {
  let puntosA = 0;
  let puntosB = 0;

  for (const partido of partidos) {
    if (partido.estado !== 'finalizado') {
      continue;
    }

    const ladoA = obtenerLadoJugador(partido, idA);
    const ladoB = obtenerLadoJugador(partido, idB);
    if (!ladoA || !ladoB || ladoA === ladoB) {
      continue;
    }

    const puntajeLado1 = partido.puntaje_dupla1 ?? partido.puntaje_jugador_1;
    const puntajeLado2 = partido.puntaje_dupla2 ?? partido.puntaje_jugador_2;
    puntosA += ladoA === 1 ? puntajeLado1 : puntajeLado2;
    puntosB += ladoB === 1 ? puntajeLado1 : puntajeLado2;
  }

  return puntosB - puntosA;
}

function obtenerLadoJugador(partido, idJugador) {
  if (partido.id_jugador_1 === idJugador) {
    return 1;
  }
  if (partido.id_jugador_2 === idJugador) {
    return 2;
  }
  if ([partido.id_jugador_a, partido.id_jugador_b].includes(idJugador)) {
    return 1;
  }
  if ([partido.id_jugador_c, partido.id_jugador_d].includes(idJugador)) {
    return 2;
  }
  return null;
}

async function borrarHistorial(req, res, next) {
  try {
    const result = await db.query(
      `DELETE FROM torneos
        WHERE estado = 'finalizado'
        RETURNING id`
    );

    return res.json({ torneos_borrados: result.rowCount });
  } catch (error) {
    return next(error);
  }
}

async function borrarTorneo(req, res, next) {
  try {
    const idTorneo = Number(req.params.id);
    const result = await db.query(
      `DELETE FROM torneos
        WHERE id = $1
        RETURNING id, nombre_torneo, estado`,
      [idTorneo]
    );

    const torneo = result.rows[0];
    if (!torneo) {
      return res.status(404).json({ message: 'Torneo no encontrado.' });
    }

    return res.json({ torneo_borrado: torneo });
  } catch (error) {
    return next(error);
  }
}

async function cerrarConCampeon(client, idTorneo, campeon, tipo) {
  if (!campeon) {
    const error = new Error('No hay participantes para calcular campeon.');
    error.statusCode = 409;
    throw error;
  }

  const updated = await client.query(
    `UPDATE torneos
        SET estado = 'finalizado',
            fecha_fin = CURRENT_DATE,
            id_campeon = $1,
            campeon_tipo = $2,
            campeon_nombre = $3
      WHERE id = $4
      RETURNING *`,
    [campeon.id, tipo, campeon.nombre, idTorneo]
  );

  return updated.rows[0];
}

module.exports = {
  listarTorneos,
  obtenerInfoCompartir,
  listarHistorial,
  exportarBackup,
  obtenerTorneo,
  crearTorneo,
  generarFixture,
  cargarResultadoParejas,
  cargarResultadoIndividual,
  cargarResultadoIndividual1v1,
  finalizarTorneo,
  borrarTorneo,
  borrarHistorial,
};
