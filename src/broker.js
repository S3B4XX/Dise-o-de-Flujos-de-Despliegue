/**
 * InMemoryBroker — simulates RabbitMQ behaviour.
 * Features: named queues, consumer registration, retry with exponential
 * backoff (max 3 attempts), Dead-Letter Queue (DLQ).
 */

import { logger } from './logger.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500; // backoff base

export class InMemoryBroker {
  constructor() {
    /** @type {Map<string, Array<{msg: object, attempts: number}>>} */
    this._queues = new Map();
    /** @type {Map<string, Function>} */
    this._consumers = new Map();
    /** @type {Array<object>} Dead-Letter Queue */
    this._dlq = [];
    /** @type {Array<{ts: string, event: string, data: object}>} audit log */
    this._events = [];
  }

  // ── Queue management ──────────────────────────────────────────────────────

  _ensureQueue(name) {
    if (!this._queues.has(name)) this._queues.set(name, []);
  }

  /**
   * Publish a message to a named queue and trigger the consumer if registered.
   * @param {string} queue
   * @param {object} message
   */
  publish(queue, message) {
    this._ensureQueue(queue);
    const envelope = { msg: message, attempts: 0 };
    this._queues.get(queue).push(envelope);
    this._log('PUBLISHED', { queue, messageId: message.orderId });
    logger.info(`[Broker] Published → ${queue}`, message);
    this._dispatch(queue, envelope);
  }

  /**
   * Register a consumer function for a queue.
   * @param {string} queue
   * @param {Function} handler  async fn(message) — throws on failure
   */
  subscribe(queue, handler) {
    this._ensureQueue(queue);
    this._consumers.set(queue, handler);
    logger.info(`[Broker] Consumer registered for queue: ${queue}`);
  }

  // ── Internal dispatch with retry + backoff ────────────────────────────────

  async _dispatch(queue, envelope) {
    const handler = this._consumers.get(queue);
    if (!handler) return; // no consumer yet; message stays queued

    envelope.attempts += 1;
    const { msg, attempts } = envelope;

    try {
      await handler(msg);
      // Success — remove from queue
      const q = this._queues.get(queue);
      const idx = q.indexOf(envelope);
      if (idx !== -1) q.splice(idx, 1);
      this._log('PROCESSED', { queue, messageId: msg.orderId, attempts });
      logger.info(`[Broker] ✓ Processed (attempt ${attempts}) → ${queue}`, msg);
    } catch (err) {
      this._log('FAILED', { queue, messageId: msg.orderId, attempts, error: err.message });
      logger.warn(`[Broker] ✗ Failed (attempt ${attempts}/${MAX_RETRIES}) → ${queue}: ${err.message}`);

      if (attempts < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempts - 1); // exponential backoff
        logger.info(`[Broker] Retrying in ${delay}ms (attempt ${attempts + 1}/${MAX_RETRIES})…`);
        setTimeout(() => this._dispatch(queue, envelope), delay);
      } else {
        // Move to DLQ
        const deadLetter = {
          queue,
          message: msg,
          attempts,
          reason: err.message,
          ts: new Date().toISOString(),
        };
        this._dlq.push(deadLetter);
        const q = this._queues.get(queue);
        const idx = q.indexOf(envelope);
        if (idx !== -1) q.splice(idx, 1);
        this._log('DLQ', { queue, messageId: msg.orderId, reason: err.message });
        logger.error(`[Broker] ☠ DLQ ← ${queue} after ${attempts} attempts`, msg);
      }
    }
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  getDLQ() {
    return [...this._dlq];
  }

  getEvents() {
    return [...this._events];
  }

  getQueueDepth(name) {
    return this._queues.get(name)?.length ?? 0;
  }

  // ── Internal logging ──────────────────────────────────────────────────────

  _log(event, data) {
    this._events.push({ ts: new Date().toISOString(), event, data });
  }
}
