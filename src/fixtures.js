function generarRoundRobinParejas(parejas) {
  const participantes = [...parejas];
  if (participantes.length < 5) {
    throw new Error('Se requieren al menos 5 parejas.');
  }

  if (participantes.length % 2 !== 0) {
    participantes.push({ id: null, nombre_equipo: 'Fecha libre' });
  }

  const rondas = [];
  const total = participantes.length;
  const mitad = total / 2;
  let rotacion = [...participantes];

  for (let ronda = 1; ronda < total; ronda += 1) {
    const partidos = [];

    for (let i = 0; i < mitad; i += 1) {
      const local = rotacion[i];
      const visitante = rotacion[total - 1 - i];

      if (local.id === null || visitante.id === null) {
        const libre = local.id === null ? visitante : local;
        partidos.push({
          ronda,
          id_pareja1: libre.id,
          id_pareja2: null,
          es_fecha_libre: true,
        });
      } else {
        partidos.push({
          ronda,
          id_pareja1: local.id,
          id_pareja2: visitante.id,
          es_fecha_libre: false,
        });
      }
    }

    rondas.push(partidos);
    rotacion = [rotacion[0], rotacion[total - 1], ...rotacion.slice(1, total - 1)];
  }

  return rondas.flat();
}

function generarRotacionIndividual(jugadores) {
  if (jugadores.length < 7) {
    throw new Error('Se requieren al menos 7 jugadores.');
  }

  const participantes = [...jugadores];
  if (participantes.length % 2 !== 0) {
    participantes.push({ id: null, nombre: 'Libre' });
  }

  const total = participantes.length;
  const mitad = total / 2;
  const rondas = [];
  let rotacion = [...participantes];

  for (let ronda = 1; ronda < total; ronda += 1) {
    const parejasDeRonda = [];

    for (let i = 0; i < mitad; i += 1) {
      const jugador1 = rotacion[i];
      const jugador2 = rotacion[total - 1 - i];
      if (jugador1.id !== null && jugador2.id !== null) {
        parejasDeRonda.push([jugador1, jugador2]);
      }
    }

    const offset = (ronda - 1) % Math.max(1, parejasDeRonda.length);
    const parejasOrdenadas = [
      ...parejasDeRonda.slice(offset),
      ...parejasDeRonda.slice(0, offset),
    ];

    for (let i = 0; i + 1 < parejasOrdenadas.length; i += 2) {
      const dupla1 = parejasOrdenadas[i];
      const dupla2 = parejasOrdenadas[i + 1];
      rondas.push({
        ronda,
        id_jugador_A: dupla1[0].id,
        id_jugador_B: dupla1[1].id,
        id_jugador_C: dupla2[0].id,
        id_jugador_D: dupla2[1].id,
      });
    }

    rotacion = [rotacion[0], rotacion[total - 1], ...rotacion.slice(1, total - 1)];
  }

  validarDuplasUnicas(rondas);
  return rondas;
}

function generarRoundRobinIndividual1v1(jugadores) {
  if (jugadores.length < 2) {
    throw new Error('Se requieren al menos 2 jugadores.');
  }

  const participantes = [...jugadores];
  if (participantes.length % 2 !== 0) {
    participantes.push({ id: null, nombre: 'Libre' });
  }

  const rondas = [];
  const total = participantes.length;
  const mitad = total / 2;
  let rotacion = [...participantes];

  for (let ronda = 1; ronda < total; ronda += 1) {
    for (let i = 0; i < mitad; i += 1) {
      const jugador1 = rotacion[i];
      const jugador2 = rotacion[total - 1 - i];

      rondas.push({
        ronda,
        id_jugador_1: jugador1.id || jugador2.id,
        id_jugador_2: jugador1.id === null || jugador2.id === null ? null : jugador2.id,
        es_fecha_libre: jugador1.id === null || jugador2.id === null,
      });
    }

    rotacion = [rotacion[0], rotacion[total - 1], ...rotacion.slice(1, total - 1)];
  }

  return rondas;
}

function validarDuplasUnicas(partidos) {
  const duplas = new Set();

  for (const partido of partidos) {
    const parejas = [
      [partido.id_jugador_A, partido.id_jugador_B],
      [partido.id_jugador_C, partido.id_jugador_D],
    ];

    for (const pareja of parejas) {
      const key = pareja.slice().sort((a, b) => a - b).join('-');
      if (duplas.has(key)) {
        throw new Error('No se pudo generar un fixture individual sin duplas repetidas.');
      }
      duplas.add(key);
    }
  }
}

module.exports = {
  generarRoundRobinParejas,
  generarRotacionIndividual,
  generarRoundRobinIndividual1v1,
};
