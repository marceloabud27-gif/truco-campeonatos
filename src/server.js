require('dotenv').config();

const path = require('path');
const cors = require('cors');
const express = require('express');
const auth = require('./auth');
const controllers = require('./controllers');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
app.set('port', port);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', auth.login);

app.get('/api/torneos', controllers.listarTorneos);
app.get('/api/torneos/:id', auth.optionalAdmin, controllers.obtenerTorneo);
app.get('/api/historial', auth.requireAdmin, controllers.listarHistorial);
app.get('/api/historial-publico', controllers.listarHistorial);
app.get('/api/share-info', controllers.obtenerInfoCompartir);
app.get('/api/backup', auth.requireAdmin, controllers.exportarBackup);

app.post('/api/torneos', auth.requireAdmin, controllers.crearTorneo);
app.post('/api/torneos/:id/generar-fixture', auth.requireAdmin, controllers.generarFixture);
app.post('/api/torneos/:id/finalizar', auth.requireAdmin, controllers.finalizarTorneo);
app.delete('/api/torneos/:id', auth.requireAdmin, controllers.borrarTorneo);
app.delete('/api/historial/:id', auth.requireAdmin, controllers.borrarTorneoHistorial);
app.delete('/api/historial', auth.requireAdmin, controllers.borrarHistorial);
app.post('/api/partidos/parejas/:id/resultado', auth.requireAdmin, controllers.cargarResultadoParejas);
app.post('/api/partidos/individuales/:id/resultado', auth.requireAdmin, controllers.cargarResultadoIndividual);
app.post('/api/partidos/individuales-1v1/:id/resultado', auth.requireAdmin, controllers.cargarResultadoIndividual1v1);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: statusCode === 500 ? 'Error interno del servidor.' : error.message,
  });
});

db.ensureSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Truco Campeonatos corriendo en http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo preparar la base de datos.', error);
    process.exit(1);
  });
