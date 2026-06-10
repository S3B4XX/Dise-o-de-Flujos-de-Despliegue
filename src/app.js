/**
 * BikeStore Async v1.0 — entry point.
 * Wires broker → workers → HTTP server.
 */

import { InMemoryBroker } from './broker.js';
import { startPaymentWorker } from './paymentWorker.js';
import { startEmailWorker } from './emailWorker.js';
import { createServer } from './server.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const broker = new InMemoryBroker();

// Register workers
startPaymentWorker(broker);
startEmailWorker(broker);

// Start HTTP server
const server = createServer(broker);
server.listen(PORT, () => {
  logger.info(`[App] BikeStore Async v1.0 running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('[App] SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});

export { broker, server }; // for integration tests
