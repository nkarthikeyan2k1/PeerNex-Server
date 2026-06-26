// Tiny leveled, timestamped console wrapper. Replaces scattered `console.log`
// calls so output is consistent and can be silenced via LOG_LEVEL.
const config = require("../config");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, args) {
  if (LEVELS[level] < threshold) return;
  const prefix = `${new Date().toISOString()} [${level.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(prefix, ...args);
}

module.exports = {
  debug: (...args) => log("debug", args),
  info: (...args) => log("info", args),
  warn: (...args) => log("warn", args),
  error: (...args) => log("error", args),
};
