const test = require('node:test');
const assert = require('node:assert/strict');
const { generarRoundRobinParejas } = require('../src/fixtures');

function crearParejas(cantidad) {
  return Array.from({ length: cantidad }, (_, index) => ({
    id: index + 1,
    nombre_equipo: `Equipo ${index + 1}`,
  }));
}

function claveCruce(partido) {
  return [partido.id_pareja1, partido.id_pareja2].sort((a, b) => a - b).join('-');
}

test('cinco parejas juegan ida y vuelta en 10 rondas y 20 partidos', () => {
  const fixture = generarRoundRobinParejas(crearParejas(5));
  const jugables = fixture.filter((partido) => !partido.es_fecha_libre);
  const libres = fixture.filter((partido) => partido.es_fecha_libre);

  assert.equal(jugables.length, 20);
  assert.equal(libres.length, 10);
  assert.deepEqual([...new Set(fixture.map((partido) => partido.ronda))], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  for (const pareja of crearParejas(5)) {
    assert.equal(
      jugables.filter((partido) => partido.id_pareja1 === pareja.id || partido.id_pareja2 === pareja.id).length,
      8,
    );
    assert.equal(libres.filter((partido) => partido.id_pareja1 === pareja.id).length, 2);
  }

  const cruces = jugables.reduce((map, partido) => {
    const clave = claveCruce(partido);
    map.set(clave, [...(map.get(clave) || []), partido]);
    return map;
  }, new Map());
  assert.equal(cruces.size, 10);
  for (const partidos of cruces.values()) {
    assert.equal(partidos.length, 2);
    assert.equal(partidos[0].id_pareja1, partidos[1].id_pareja2);
    assert.equal(partidos[0].id_pareja2, partidos[1].id_pareja1);
  }
});

test('cuatro parejas juegan 12 partidos en 6 rondas', () => {
  const fixture = generarRoundRobinParejas(crearParejas(4));
  assert.equal(fixture.length, 12);
  assert.equal(new Set(fixture.map((partido) => partido.ronda)).size, 6);
  assert.equal(fixture.filter((partido) => partido.es_fecha_libre).length, 0);
});
