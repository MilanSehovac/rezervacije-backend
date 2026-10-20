require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { sequelize } = require('./models');

const port = process.env.PORT || 8000;
const app = express();

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
  } catch (err) {
    console.error(err);
  }
})();

// images are loaded by the frontend on another origin
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser());
// Express 5 leaves req.body undefined when a request has no body
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });

const publicController = require('./controllers/publicController');
app.get('/robots.txt', publicController.robots);
app.get('/sitemap.xml', publicController.sitemap);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' }));

// brute-force protection for login / registration
if (process.env.NODE_ENV !== 'test') {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again in a few minutes' },
  });
  app.post('/api/users/login', authLimiter);
  app.post('/api/users', authLimiter);
}

app.use('/api', require('./Routes/publicRoutes'))
app.use('/api/users', require('./Routes/userRoutes'))
app.use('/api/admin', require('./Routes/adminRoutes'))
app.use('/api/favorites', require('./Routes/favoriteRoutes'))
app.use('/api/notifications', require('./Routes/notificationRoutes'))
app.use('/api/salon', require('./Routes/salonRoutes'))
app.use('/api/bookings', require('./Routes/bookingRoutes'))

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Malformed JSON bodies and any other uncaught error
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

if (require.main === module) {
  require('./services/notifications').startReminderJob();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
