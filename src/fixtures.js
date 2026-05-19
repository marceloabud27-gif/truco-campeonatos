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
  const duplasPorRonda = [];
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

    duplasPorRonda.push({ ronda, duplas: parejasDeRonda });

    rotacion = [rotacion[0], rotacion[total - 1], ...rotacion.slice(1, total - 1)];
  }

  const rondas = optimizarRivalesIndividuales(duplasPorRonda, jugadores.map((jugador) => jugador.id));
  validarDuplasUnicas(rondas);
  return rondas;
}

function optimizarRivalesIndividuales(duplasPorRonda, jugadorIds) {
  const rondasConOpciones = duplasPorRonda.map(({ ronda, duplas }) => ({
    ronda,
    opciones: generarOpcionesDeCruces(duplas).map((cruces) => cruces.map(([dupla1, dupla2]) => ({
      ronda,
      id_jugador_A: dupla1[0].id,
      id_jugador_B: dupla1[1].id,
      id_jugador_C: dupla2[0].id,
      id_jugador_D: dupla2[1].id,
    }))),
  }));

  const combinaciones = rondasConOpciones.reduce((total, ronda) => total * Math.max(1, ronda.opciones.length), 1);
  if (combinaciones <= 250000) {
    return buscarMejorFixturePorRivales(rondasConOpciones, jugadorIds);
  }

  return generarFixtureGreedyPorRivales(rondasConOpciones, jugadorIds);
}

function buscarMejorFixturePorRivales(rondasConOpciones, jugadorIds) {
  let mejorFixture = null;
  let mejorPuntaje = Infinity;

  function explorar(indiceRonda, acumulado, contadorRivales) {
    if (indiceRonda === rondasConOpciones.length) {
      const puntaje = puntuarBalanceRivales(contadorRivales, jugadorIds);
      if (puntaje < mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejorFixture = [...acumulado];
      }
      return;
    }

    for (const opcion of rondasConOpciones[indiceRonda].opciones) {
      const siguienteContador = new Map(contadorRivales);
      sumarRivalesDePartidos(siguienteContador, opcion);
      explorar(indiceRonda + 1, [...acumulado, ...opcion], siguienteContador);
    }
  }

  explorar(0, [], new Map());
  return mejorFixture;
}

function generarFixtureGreedyPorRivales(rondasConOpciones, jugadorIds) {
  const contadorRivales = new Map();
  const fixture = [];

  for (const ronda of rondasConOpciones) {
    let mejorOpcion = ronda.opciones[0];
    let mejorPuntaje = Infinity;

    for (const opcion of ronda.opciones) {
      const siguienteContador = new Map(contadorRivales);
      sumarRivalesDePartidos(siguienteContador, opcion);
      const puntaje = puntuarBalanceRivales(siguienteContador, jugadorIds);
      if (puntaje < mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejorOpcion = opcion;
      }
    }

    sumarRivalesDePartidos(contadorRivales, mejorOpcion);
    fixture.push(...mejorOpcion);
  }

  return fixture;
}

function generarOpcionesDeCruces(duplas) {
  if (duplas.length < 2) {
    return [[]];
  }

  if (duplas.length % 2 !== 0) {
    return duplas.flatMap((_, indexLibre) => (
      generarOpcionesDeCruces(duplas.filter((__, index) => index !== indexLibre))
    ));
  }

  const [primera, ...resto] = duplas;
  const opciones = [];

  for (let i = 0; i < resto.length; i += 1) {
    const rival = resto[i];
    const restantes = resto.filter((_, index) => index !== i);
    for (const crucesRestantes of generarOpcionesDeCruces(restantes)) {
      opciones.push([[primera, rival], ...crucesRestantes]);
    }
  }

  return opciones;
}

function sumarRivalesDePartidos(contadorRivales, partidos) {
  for (const partido of partidos) {
    const dupla1 = [partido.id_jugador_A, partido.id_jugador_B];
    const dupla2 = [partido.id_jugador_C, partido.id_jugador_D];

    for (const jugador1 of dupla1) {
      for (const jugador2 of dupla2) {
        const key = rivalKey(jugador1, jugador2);
        contadorRivales.set(key, (contadorRivales.get(key) || 0) + 1);
      }
    }
  }
}

function puntuarBalanceRivales(contadorRivales, jugadorIds) {
  const counts = [];
  for (let i = 0; i < jugadorIds.length; i += 1) {
    for (let j = i + 1; j < jugadorIds.length; j += 1) {
      counts.push(contadorRivales.get(rivalKey(jugadorIds[i], jugadorIds[j])) || 0);
    }
  }

  const total = counts.reduce((sum, count) => sum + count, 0);
  const ideal = counts.length ? total / counts.length : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const min = counts.length ? Math.min(...counts) : 0;
  const variance = counts.reduce((sum, count) => sum + ((count - ideal) ** 2), 0);
  const sobreRepetidos = counts.reduce((sum, count) => sum + Math.max(0, count - Math.ceil(ideal)) ** 2, 0);
  const balancePorJugador = jugadorIds.reduce((sum, jugadorId) => {
    const conteosJugador = jugadorIds
      .filter((otroId) => otroId !== jugadorId)
      .map((otroId) => contadorRivales.get(rivalKey(jugadorId, otroId)) || 0);
    const maxJugador = conteosJugador.length ? Math.max(...conteosJugador) : 0;
    const minJugador = conteosJugador.length ? Math.min(...conteosJugador) : 0;
    const totalJugador = conteosJugador.reduce((totalParcial, count) => totalParcial + count, 0);
    const idealJugador = conteosJugador.length ? totalJugador / conteosJugador.length : 0;
    const varianceJugador = conteosJugador.reduce((totalParcial, count) => (
      totalParcial + ((count - idealJugador) ** 2)
    ), 0);

    return sum + (((maxJugador - minJugador) ** 2) * 100) + varianceJugador;
  }, 0);

  return (max * 100000) + ((max - min) * 10000) + (sobreRepetidos * 1000) + variance + balancePorJugador;
}

function rivalKey(idA, idB) {
  return [idA, idB].sort((a, b) => a - b).join('-');
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
