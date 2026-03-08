require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// Configuración de variables de entorno
const PORT = process.env.PORT || 3000;

// Inicialización de Express
const app = express();

// Middlewares
app.use(cors());
app.use(express.json()); // Permite parsear el body de las peticiones en formato JSON

// Rutas
app.use('/api/disponibilidad', require('./routes/disponibilidadRoutes'));
app.use('/api/torneos', require('./routes/torneosRoutes'));
app.use('/api/partidos', require('./routes/partidosRoutes'));
app.use('/api/perfil', require('./routes/perfilRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/rankings', require('./routes/rankingsRoutes'));



// Configuración del servidor HTTP nativo
const server = http.createServer(app);

// Inicialización de Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // En producción, cambiar "*" por la URL del frontend
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Rutas que requieren la instancia de io (deben ir después de inicializar io)
app.use('/api/canchas', require('./routes/canchasRoutes')(io));

// Evento básico de conexión en Socket.io
io.on('connection', (socket) => {
  console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API de TennisFlow funcionando correctamente 🎾' });
});

// Arrancar el servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});

module.exports = { app, server, io };
