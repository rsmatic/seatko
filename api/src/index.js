import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import './db.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import eventRoutes from './routes/events.js';
import seatingRoutes from './routes/seating.js';
import salesRoutes from './routes/sales.js';
import statsRoutes from './routes/stats.js';
import publicRoutes from './routes/public.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// Uploaded images (logo, posters). Sandbox them so an uploaded SVG can never run script on our origin.
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(config.uploadDir, { maxAge: '1h' }));

// Website embed script (see api/public/embed.js). Any site may load it.
app.get('/embed.js', cors(), (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(config.root, 'public/embed.js'));
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/public', publicRoutes);

app.use('/api', requireAuth);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/events/:id', seatingRoutes);
app.use('/api', salesRoutes);
app.use('/api', statsRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app from the same origin.
const webDist = path.resolve(config.root, '../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message });
  }
  if (err.code?.startsWith?.('SQLITE_CONSTRAINT')) return res.status(400).json({ error: 'That change conflicts with existing data' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

app.listen(config.port, () => console.log(`Seatko API listening on http://localhost:${config.port}`));
