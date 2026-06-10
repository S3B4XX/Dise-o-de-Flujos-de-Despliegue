/**
 * Minimal structured logger — no external deps.
 */

const LEVELS = { info: 0, warn: 1, error: 2 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function format(level, msg, extra) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  return extra ? `${base} ${JSON.stringify(extra)}` : base;
}

export const logger = {
  info(msg, extra) {
    if (currentLevel <= LEVELS.info) console.log(format('info', msg, extra));
  },
  warn(msg, extra) {
    if (currentLevel <= LEVELS.warn) console.warn(format('warn', msg, extra));
  },
  error(msg, extra) {
    if (currentLevel <= LEVELS.error) console.error(format('error', msg, extra));
  },
};
