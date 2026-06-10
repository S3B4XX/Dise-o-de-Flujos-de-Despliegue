/**
 * Integration tests — full order processing flows
 * Run: node --test test/integration.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { InMemoryBroker } from '../src/broker.js';
import { startPaymentWorker, setFailureRate } from '../src/paymentWorker.js';
import { startEmailWorker } from '../src/emailWorker.js';
import { createServer } from '../src/server.js';
import { placeOrder } from '../src/producer.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Suite 1 — Successful order flow ─────────────────────────────────────────

describe('Integration: successful order flow', () => {
  let broker, server;
  const PORT = 4001;

  before(async () => {
    broker = new InMemoryBroker();
    setFailureRate(0); // guarantee success
    startPaymentWorker(broker);
    startEmailWorker(broker);
    server = createServer(broker);
    await new Promise((r) => server.listen(PORT, r));
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    setFailureRate(0.4); // restore default
  });

  it('POST /ordenar should return 202 with an orderId', async () => {
    const res = await httpRequest(
      { hostname: 'localhost', port: PORT, path: '/ordenar', method: 'POST',
        headers: { 'Content-Type': 'application/json' } },
      { customerName: 'Seb', email: 'seb@test.com', product: 'Trek Marlin', quantity: 1, unitPrice: 599 }
    );
    assert.equal(res.status, 202);
    assert.ok(res.body.orderId, 'Response should contain orderId');
  });

  it('should process payment and emit events — no DLQ entries', async () => {
    const order = placeOrder(broker, {
      customerName: 'Ana Torres',
      email: 'ana@test.com',
      product: 'Specialized Allez',
      quantity: 2,
      unitPrice: 899,
    });

    await wait(400); // allow async workers to complete

    const events = broker.getEvents().map((e) => e.event);
    assert.ok(events.includes('PUBLISHED'));
    assert.ok(events.includes('PROCESSED'));

    const dlq = broker.getDLQ();
    assert.equal(dlq.length, 0, 'DLQ should be empty on successful flow');
  });

  it('GET /health should return status ok', async () => {
    const res = await httpRequest({
      hostname: 'localhost', port: PORT, path: '/health', method: 'GET',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('GET /events should return a non-empty array', async () => {
    const res = await httpRequest({
      hostname: 'localhost', port: PORT, path: '/events', method: 'GET',
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.events.length > 0);
  });

  it('POST /ordenar with missing fields should return 400', async () => {
    const res = await httpRequest(
      { hostname: 'localhost', port: PORT, path: '/ordenar', method: 'POST',
        headers: { 'Content-Type': 'application/json' } },
      { customerName: 'Incompleto' } // missing email, product, quantity, unitPrice
    );
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Missing fields'));
  });
});

// ── Suite 2 — Failed flow → DLQ ─────────────────────────────────────────────

describe('Integration: failed order ends in DLQ', () => {
  let broker;

  before(() => {
    broker = new InMemoryBroker();
    setFailureRate(1); // always fail
    startPaymentWorker(broker);
  });

  after(() => {
    setFailureRate(0.4);
  });

  it('should land in DLQ after 3 failed attempts', async () => {
    const order = placeOrder(broker, {
      customerName: 'Carlos DLQ',
      email: 'carlos@test.com',
      product: 'Giant TCR',
      quantity: 1,
      unitPrice: 1200,
    });

    // Wait for 3 retries (500 + 1000 + 2000 ms backoff = ~3.5 s)
    await wait(6000);

    const dlq = broker.getDLQ();
    assert.ok(dlq.length >= 1, 'Expected at least 1 DLQ entry');

    const entry = dlq.find((d) => d.message.orderId === order.orderId);
    assert.ok(entry, 'Order not found in DLQ');
    assert.equal(entry.attempts, 3);
    assert.ok(entry.reason.includes('Payment gateway timeout') ||
              entry.reason.includes('payment gateway timeout'));

    // Verify events contain a DLQ event
    const evTypes = broker.getEvents().map((e) => e.event);
    assert.ok(evTypes.includes('DLQ'));
  });

  it('GET /dlq endpoint should expose DLQ entries', async () => {
    const PORT = 4002;
    const server = createServer(broker);
    await new Promise((r) => server.listen(PORT, r));

    const res = await httpRequest({
      hostname: 'localhost', port: PORT, path: '/dlq', method: 'GET',
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.dlq));
    assert.ok(res.body.dlq.length >= 1);

    await new Promise((r) => server.close(r));
  });
});
