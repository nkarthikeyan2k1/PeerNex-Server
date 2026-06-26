// The pool of users waiting to be matched. Backed by a Map (insertion order =
// arrival order, which gives us FIFO fairness for free). This class is the
// single seam to swap for a Redis-backed store later — nothing outside it
// knows how waiting users are stored.
class WaitingPool {
  constructor() {
    this._entries = new Map(); // socketId -> { id, socket, interests, joinedAt }
  }

  /** Add a socket to the pool and return its entry. */
  add(socket, interests) {
    const entry = { id: socket.id, socket, interests, joinedAt: Date.now() };
    this._entries.set(socket.id, entry);
    return entry;
  }

  /** Remove a socket from the pool. Returns true if it was present. */
  remove(socketId) {
    return this._entries.delete(socketId);
  }

  has(socketId) {
    return this._entries.has(socketId);
  }

  get(socketId) {
    return this._entries.get(socketId);
  }

  size() {
    return this._entries.size;
  }

  /** Snapshot of all entries in arrival order. */
  snapshot() {
    return [...this._entries.values()];
  }
}

module.exports = WaitingPool;
