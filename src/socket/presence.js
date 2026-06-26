const events = require("./events");

// Debounced broadcaster for the global user-count update. Bursts of
// connect/match/disconnect activity coalesce into at most one emit per window.
class Presence {
  constructor({ io, pool, debounceMs }) {
    this._io = io;
    this._pool = pool;
    this._debounceMs = debounceMs;
    this._timer = null;
  }

  /** Request a broadcast; no-op if one is already scheduled in this window. */
  schedule() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._io.emit(events.USER_COUNT_UPDATE, {
        totalUsers: this._io.engine.clientsCount,
        waitingUsers: this._pool.size(),
      });
    }, this._debounceMs);
    if (this._timer.unref) this._timer.unref();
  }
}

module.exports = Presence;
