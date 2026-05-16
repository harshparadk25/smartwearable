const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { randomBytes } = require('crypto');
const { Server } = require('socket.io');
const healthRoutes = require('./routes/healthRoutes');
const alertRoutes = require('./routes/alertRoutes');
const authRoutes = require('./routes/authRoutes');
const connectionRoutes = require('./routes/connectionRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const familyRoutes = require('./routes/familyRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const { initStore } = require('./storage/dataStore');

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me') {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  console.warn('[warn] JWT_SECRET not set — generated a random secret for this session. Set JWT_SECRET in .env for persistence across restarts.');
}

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Support comma-separated list of origins or '*' for open access (home network use)
const rawOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const CLIENT_ORIGIN = rawOrigin === '*' ? '*' : rawOrigin.split(',').map((s) => s.trim());

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] }
});

app.set('io', io);
app.set('trust proxy', 1);
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/health', healthRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/analysis', analysisRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

io.on('connection', (socket) => {
  socket.emit('connected', { message: 'socket connected' });
});

initStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`CORS origin: ${rawOrigin}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize local data store', err);
    process.exit(1);
  });
