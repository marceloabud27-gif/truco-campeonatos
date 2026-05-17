const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado');
  }
  return process.env.JWT_SECRET;
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Usuario y password son obligatorios.' });
    }

    const result = await db.query(
      'SELECT id, username, password_hash FROM usuarios_admin WHERE username = $1',
      [username]
    );

    const admin = result.rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    const token = jwt.sign(
      { sub: admin.id, username: admin.username, role: 'admin' },
      getJwtSecret(),
      { expiresIn: '8h' }
    );

    return res.json({ token, admin: { id: admin.id, username: admin.username } });
  } catch (error) {
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Se requiere iniciar sesion como Admin.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Permiso insuficiente.' });
    }
    req.admin = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o vencido.' });
  }
}

function optionalAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.role === 'admin') {
      req.admin = payload;
    }
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o vencido.' });
  }
}

module.exports = {
  login,
  requireAdmin,
  optionalAdmin,
};
