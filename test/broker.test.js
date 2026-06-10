/**
 * Unit tests — InMemoryBroker
 * Run: node --test test/broker.test.js
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryBroker } from '../src/broker.js';

// ── Helper: wait for async side-effects ─────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('InMemoryBroker', () => {

  describe('publish / subscribe — happy path', () => {
    it('should deliver a message to a registered consumer', async () => {
      const broker = new InMemoryBroker();
      let received = null;

      broker.subscribe('test.queue', async (msg) => { received = msg; });
      broker.publish('test.queue', { orderId: 'abc-123' });

      await wait(50);
      assert.deepEqual(received, { orderId: 'abc-123' });
    });

    it('should log a PUBLISHED and PROCESSED event', async () => {
      const broker = new InMemoryBroker();
      broker.subscribe('test.queue', async () => {});
      broker.publish('test.queue', { orderId: 'ev-001' });

      await wait(50);
      const events = broker.getEvents().map(e => e.event);
      assert.ok(events.includes('PUBLISHED'));
      assert.ok(events.includes('PROCESSED'));
    });
  });

  describe('retry with backoff', () => {
    it('should retry up to MAX_RETRIES before moving to DLQ', async () => {
      const broker = new InMemoryBroker();
      let callCount = 0;

      broker.subscribe('retry.queue', async () => {
        callCount++;
        throw new Error('Simulated failure');
      });

      broker.publish('retry.queue', { orderId: 'retry-001' });

      // 3 attempts × (500 + 1000 + 2000) ms max — wait enough
      await wait(5000);

      assert.equal(callCount, 3, `Expected 3 attempts, got ${callCount}`);
      const dlq = broker.getDLQ();
      assert.equal(dlq.length, 1);
      assert.equal(dlq[0].message.orderId, 'retry-001');
      assert.equal(dlq[0].attempts, 3);
    });
  });

  describe('dead-letter queue', () => {
    it('should include reason and queue name in the DLQ entry', async () => {
      const broker = new InMemoryBroker();
      broker.subscribe('dlq.queue', async () => { throw new Error('payment gateway timeout'); });
      broker.publish('dlq.queue', { orderId: 'dlq-007' });

      await wait(5000);

      const dlq = broker.getDLQ();
      assert.ok(dlq.length >= 1);
      const entry = dlq.find(d => d.message.orderId === 'dlq-007');
      assert.ok(entry, 'DLQ entry not found');
      assert.equal(entry.queue, 'dlq.queue');
      assert.ok(entry.reason.includes('payment gateway timeout'));
    });

    it('getDLQ() should return a copy — not a live reference', async () => {
      const broker = new InMemoryBroker();
      broker.subscribe('copy.queue', async () => { throw new Error('x'); });
      broker.publish('copy.queue', { orderId: 'copy-001' });

      await wait(5000);

      const snap1 = broker.getDLQ();
      const snap2 = broker.getDLQ();
      assert.notEqual(snap1, snap2); // different array references
      assert.deepEqual(snap1, snap2);
    });
  });

  describe('getQueueDepth', () => {
    it('should return 0 for an unknown queue', () => {
      const broker = new InMemoryBroker();
      assert.equal(broker.getQueueDepth('nonexistent'), 0);
    });
  });
});
