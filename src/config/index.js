// Centralized configuration. Every environment variable is read exactly once,
// here, and exposed as a typed config object. Nothing else in the codebase
// should touch `process.env` directly.
require("dotenv").config();

function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: intFromEnv("PORT", 3001),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  logLevel: process.env.LOG_LEVEL || "info",

  // Matchmaking tunables — see src/matching for how each is used.
  matching: {
    // How long a user will hold out for an interest-based match before the
    // sweep is allowed to pair them with anyone available.
    patienceMs: intFromEnv("MATCH_PATIENCE_MS", 6000),
    // After a pair splits, they won't be re-matched to each other for this long.
    recentPartnerCooldownMs: intFromEnv("RECENT_PARTNER_COOLDOWN_MS", 30000),
    // How often the background sweep tries to pair long-waiting users.
    sweepIntervalMs: intFromEnv("MATCH_SWEEP_INTERVAL_MS", 2000),
    // Abuse limits on the interest list a client may submit.
    maxInterests: intFromEnv("MAX_INTERESTS", 10),
    maxInterestLength: intFromEnv("MAX_INTEREST_LEN", 30),
  },

  presence: {
    // userCountUpdate is broadcast at most once per this window.
    userCountDebounceMs: intFromEnv("USER_COUNT_DEBOUNCE_MS", 1000),
  },
};

module.exports = config;
