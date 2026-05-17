require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Uso: node scripts/create-admin.js <usuario> <password>');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO usuarios_admin (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username)
     DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, passwordHash]
  );

  console.log(`Admin listo: ${username}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
