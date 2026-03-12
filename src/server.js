const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const config = require('./config');
const { requireAuth } = require('./auth');
const authRoutes = require('./routes/auth');
const soapRoutes = require('./routes/soap');

const app = express();

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, mobile apps)
    if (!origin) return cb(null, true);
    // Always allow localhost (any port) for dev
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
    // Check against configured origins
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'SOAPAction'],
}));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,                 // 120 requests per minute per IP
  message: { error: 'Demasiados pedidos. Tente novamente em breve.' },
});
app.use(limiter);

// Stricter limit for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 login attempts per 15 min
  message: { error: 'Demasiadas tentativas de login. Tente novamente em 15 minutos.' },
});

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan('short'));

// ─── Body parsers ────────────────────────────────────────────────────────────
// JSON for auth routes
app.use('/api/auth', express.json());
// Raw text for SOAP proxy routes (preserves SOAP XML as-is)
app.use('/api/soap', express.text({ type: ['text/xml', 'application/xml', 'text/plain'], limit: '1mb' }));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth routes (public) ────────────────────────────────────────────────────
app.use('/api/auth', loginLimiter, authRoutes);

// ─── JWT middleware for all /api/soap routes ─────────────────────────────────
app.use('/api/soap', requireAuth);

// ─── SOAP proxy routes (protected) ──────────────────────────────────────────
app.use('/api/soap', soapRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[SERVER] Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[nabalia-proxy] Running on http://localhost:${config.port}`);
  console.log(`[nabalia-proxy] BC14 target: ${config.bc14.wsBase}`);
  console.log(`[nabalia-proxy] CORS origins: ${config.corsOrigins.join(', ')}`);
});
