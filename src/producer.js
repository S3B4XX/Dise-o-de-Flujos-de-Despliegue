/**
 * Producer — creates well-formed order objects and publishes them
 * to the `orders.payment` queue.
 */

import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

const QUEUE = 'orders.payment';

/**
 * Build and publish a new order.
 * @param {import('./broker.js').InMemoryBroker} broker
 * @param {{ customerName: string, email: string, product: string, quantity: number, unitPrice: number }} payload
 * @returns {object} The order object that was published
 */
export function placeOrder(broker, payload) {
  const order = {
    orderId: randomUUID(),
    customerName: payload.customerName,
    email: payload.email,
    product: payload.product,
    quantity: Number(payload.quantity),
    unitPrice: Number(payload.unitPrice),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  logger.info(`[Producer] New order placed → ${order.orderId}`, order);
  broker.publish(QUEUE, order);
  return order;
}
