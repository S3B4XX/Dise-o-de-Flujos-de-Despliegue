# BikeStore Async v1.0 — Technical Documentation

## Overview

BikeStore Async v1.0 is a pure Node.js 20+ application (zero external dependencies) that demonstrates an asynchronous order-processing pipeline using the **Producer → Broker → Worker** pattern.

---

## Architecture

```
Client (browser)
      │
      │  POST /ordenar
      ▼
┌─────────────┐     publish      ┌──────────────────────┐
│  HTTP Server│ ───────────────► │   InMemoryBroker     │
│ (native http)│                 │                      │
└─────────────┘                  │  orders.payment ───► PaymentWorker
                                 │  orders.email   ───► EmailWorker
                                 │  DLQ (failed msgs)   │
                                 └──────────────────────┘
```

### Layers

| Layer | File | Responsibility |
|---|---|---|
| HTTP Server | `src/server.js` | Expose REST API, serve frontend |
| Producer | `src/producer.js` | Build order objects, publish to broker |
| Broker | `src/broker.js` | Queue management, retry, DLQ |
| PaymentWorker | `src/paymentWorker.js` | Process payment, forward to email queue |
| EmailWorker | `src/emailWorker.js` | Send confirmation (simulated) |
| Logger | `src/logger.js` | Structured log output |

---

## Broker Behaviour

- **Queues**: named in-memory arrays.
- **Retry**: exponential backoff — delays of 500 ms, 1 000 ms, 2 000 ms (3 attempts max).
- **DLQ**: after 3 consecutive failures, the message is moved to the Dead-Letter Queue with metadata (reason, attempts, timestamp).

---

## API Reference

### `GET /health`
Returns service status.
```json
{ "status": "ok", "uptime": 42.1, "ts": "2025-06-09T...", "queues": {...} }
```

### `POST /ordenar`
Creates a new order.

**Body**
```json
{
  "customerName": "Sebastián",
  "email": "seba@tienda.com",
  "product": "Trek Marlin 5",
  "quantity": 1,
  "unitPrice": 599.99
}
```

**Response `202`**
```json
{ "message": "Order accepted", "orderId": "uuid-v4" }
```

### `GET /dlq`
Returns all dead-lettered messages.

### `GET /events`
Returns the full broker event log (PUBLISHED, PROCESSED, FAILED, DLQ).

---

## CI Pipeline (`ci.yml`)

| Step | Action |
|---|---|
| 1 | `actions/checkout@v3` — pull source |
| 2 | `actions/setup-node@v3` with Node 20 |
| 3 | `node --test` — run native test suite |
| 4 | `docker build` — build production image |
| 5 | Container smoke-test via `curl /health` |

---

## Running Locally

```bash
# Start the server
node src/app.js

# Run tests
node --test test/broker.test.js test/integration.test.js

# Docker
docker build -t bikestore:latest .
docker run -p 3000:3000 bikestore:latest
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `PAYMENT_FAILURE_RATE` | `0.4` | Probability of payment failure (0–1) |
| `LOG_LEVEL` | `info` | Logging level (`info`, `warn`, `error`) |
