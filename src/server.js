/**
 * Native HTTP server — zero external dependencies.
 * Routes:
 *   GET  /          → serve frontend SPA
 *   POST /ordenar   → place a new order
 *   GET  /health    → service health check
 *   GET  /dlq       → dead-letter queue contents
 *   GET  /events    → broker/worker event log
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { placeOrder } from './producer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create and return the HTTP server instance.
 * @param {import('./broker.js').InMemoryBroker} broker
 */
export function createServer(broker) {
  const server = http.createServer(async (req, res) => {
    // CORS (useful when testing from a different origin)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://${req.headers.host}`);
    logger.info(`[HTTP] ${req.method} ${url.pathname}`);

    try {
      // ── GET / ────────────────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/') {
        serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
        return;
      }

      // ── Static files (css, js, etc.) ─────────────────────────────────────
      if (req.method === 'GET' && url.pathname.startsWith('/static/')) {
        const rel = url.pathname.replace('/static/', '');
        serveFile(res, path.join(PUBLIC_DIR, rel));
        return;
      }

      // ── GET /health ───────────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          ts: new Date().toISOString(),
          queues: {
            'orders.payment': broker.getQueueDepth('orders.payment'),
            'orders.email': broker.getQueueDepth('orders.email'),
          },
        });
        return;
      }

      // ── GET /dlq ──────────────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/dlq') {
        json(res, 200, { dlq: broker.getDLQ() });
        return;
      }

      // ── GET /events ───────────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/events') {
        json(res, 200, { events: broker.getEvents() });
        return;
      }

      // ── POST /ordenar ─────────────────────────────────────────────────────
      if (req.method === 'POST' && url.pathname === '/ordenar') {
        const body = await readBody(req);
        const required = ['customerName', 'email', 'product', 'quantity', 'unitPrice'];
        const missing = required.filter((k) => !body[k]);
        if (missing.length) {
          json(res, 400, { error: `Missing fields: ${missing.join(', ')}` });
          return;
        }

        const order = placeOrder(broker, body);
        json(res, 202, { message: 'Order accepted', orderId: order.orderId });
        return;
      }

      // ── 404 ───────────────────────────────────────────────────────────────
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error(`[HTTP] Unhandled error: ${err.message}`);
      json(res, 500, { error: 'Internal server error' });
    }
  });

  return server;
}
