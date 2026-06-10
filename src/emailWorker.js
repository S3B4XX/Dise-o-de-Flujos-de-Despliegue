/**
 * EmailWorker
 * Listens on `orders.email`.
 * Sends a simulated confirmation email to the customer.
 */

import { logger } from './logger.js';

const QUEUE_IN = 'orders.email';

/**
 * Register the EmailWorker against the given broker.
 * @param {import('./broker.js').InMemoryBroker} broker
 */
export function startEmailWorker(broker) {
  broker.subscribe(QUEUE_IN, async (order) => {
    logger.info(`[EmailWorker] Sending confirmation email for order ${order.orderId} → ${order.email}`);

    await sleep(50); // simulate SMTP call

    // Simulate the email content
    const email = {
      to: order.email,
      subject: `✅ BikeStore — Your order #${order.orderId} is confirmed!`,
      body: [
        `Hi ${order.customerName},`,
        ``,
        `Your order for "${order.product}" (qty: ${order.quantity}) has been`,
        `successfully processed and payment approved at ${order.paymentTs}.`,
        ``,
        `Order ID : ${order.orderId}`,
        `Total    : $${(order.quantity * order.unitPrice).toFixed(2)}`,
        ``,
        `Thanks for shopping at BikeStore 🚴`,
      ].join('\n'),
    };

    logger.info(`[EmailWorker] ✓ Email sent`, { to: email.to, subject: email.subject });
  });

  logger.info('[EmailWorker] Started — listening on orders.email');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
