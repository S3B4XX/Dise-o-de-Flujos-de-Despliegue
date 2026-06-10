/**
 * PaymentWorker
 * Listens on `orders.payment`.
 * Simulates payment processing with a configurable failure rate.
 * On success, forwards the enriched order to `orders.email`.
 */

import { logger } from './logger.js';

const QUEUE_IN  = 'orders.payment';
const QUEUE_OUT = 'orders.email';

/** Probability of a transient payment failure (0–1). Overridable in tests. */
export let FAILURE_RATE = parseFloat(process.env.PAYMENT_FAILURE_RATE ?? '0.4');

export function setFailureRate(rate) {
  FAILURE_RATE = rate;
}

/**
 * Register the PaymentWorker against the given broker.
 * @param {import('./broker.js').InMemoryBroker} broker
 */
export function startPaymentWorker(broker) {
  broker.subscribe(QUEUE_IN, async (order) => {
    logger.info(`[PaymentWorker] Processing payment for order ${order.orderId}`);

    // Simulate I/O latency
    await sleep(80);

    if (Math.random() < FAILURE_RATE) {
      throw new Error(`Payment gateway timeout for order ${order.orderId}`);
    }

    const enriched = {
      ...order,
      paymentStatus: 'approved',
      paymentTs: new Date().toISOString(),
    };

    logger.info(`[PaymentWorker] ✓ Payment approved for order ${order.orderId}`);
    broker.publish(QUEUE_OUT, enriched);
  });

  logger.info('[PaymentWorker] Started — listening on orders.payment');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
