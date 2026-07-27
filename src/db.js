const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  await query(`
    ALTER TABLE parejas
      ADD COLUMN IF NOT EXISTS puntos_a_favor INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS puntos_en_contra INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS diferencia_puntos INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE partidos_parejas
      ADD COLUMN IF NOT EXISTS puntaje_pareja1 INTEGER CHECK (puntaje_pareja1 BETWEEN 0 AND 40),
      ADD COLUMN IF NOT EXISTS puntaje_pareja2 INTEGER CHECK (puntaje_pareja2 BETWEEN 0 AND 40)
  `);
}

module.exports = {
  query,
  withTransaction,
  ensureSchema,
};
