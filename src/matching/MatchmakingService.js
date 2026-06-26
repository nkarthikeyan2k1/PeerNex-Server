const logger = require("../lib/logger");
const { rankCandidates } = require("./score");

// Orchestrates matchmaking over a WaitingPool and a RoomManager. Handlers talk
// only to this service; they never touch the pool or rooms directly.
//
// Strategy:
//   - On request, try to match immediately against the best-ranked waiter.
//   - Prefer shared interests; fall back to smart-random within limits.
//   - A background sweep guarantees long-waiting users eventually pair up, so
//     two people with no common interest don't wait forever.
class MatchmakingService {
  constructor({ pool, rooms, matching }) {
    this._pool = pool;
    this._rooms = rooms;
    this._patienceMs = matching.patienceMs;
    this._sweepIntervalMs = matching.sweepIntervalMs;
    this._sweepTimer = null;
    this._onCountChange = () => {};
  }

  /** Register a callback fired whenever the waiting/room counts change. */
  onCountChange(fn) {
    this._onCountChange = fn;
  }

  /** Begin the periodic sweep that pairs long-waiting users. */
  start() {
    if (this._sweepTimer) return;
    this._sweepTimer = setInterval(() => this._sweep(), this._sweepIntervalMs);
    // Don't keep the process alive just for the sweep timer.
    if (this._sweepTimer.unref) this._sweepTimer.unref();
  }

  stop() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
  }

  /**
   * Client wants a peer. Clear any prior room/queue spot, try to match now, and
   * otherwise join the waiting pool.
   * @param {import('socket.io').Socket} socket
   * @param {string[]} interests already normalized by the handler
   */
  requestMatch(socket, interests) {
    this.cancel(socket, { silent: true });

    const searcher = { id: socket.id, interests };
    const ranked = rankCandidates(searcher, this._pool.snapshot(), {
      isBlocked: (entry) => this._rooms.inCooldown(socket.id, entry.id),
    });

    const pick = this._selectImmediate(searcher, ranked);
    if (pick) {
      this._pool.remove(pick.entry.id);
      this._rooms.createRoom(socket, pick.entry.socket);
      this._onCountChange();
      return;
    }

    this._pool.add(socket, interests);
    logger.debug("queued", socket.id, "interests:", interests);
    this._onCountChange();
  }

  /**
   * Remove a socket from matchmaking: drop its queue spot and tear down its
   * room (notifying the partner). `silent` suppresses the count broadcast when
   * the caller will emit one itself.
   */
  cancel(socket, { silent = false } = {}) {
    const wasWaiting = this._pool.remove(socket.id);
    const roomId = this._rooms.leaveRoom(socket);
    const changed = Boolean(wasWaiting || roomId);
    if (changed && !silent) this._onCountChange();
    return changed;
  }

  /** Full disconnect: same cleanup as cancel plus forgetting cooldowns. */
  handleDisconnect(socket) {
    this._pool.remove(socket.id);
    this._rooms.leaveRoom(socket);
    this._rooms.forget(socket.id);
    this._onCountChange();
  }

  /** The room a socket is currently in, if any. Used by relay handlers. */
  roomIdFor(socketId) {
    return this._rooms.getRoomId(socketId);
  }

  /**
   * Decide whether to pair the searcher with the best candidate right now:
   *   - a shared interest? always match.
   *   - searcher gave no interests? they're up for anyone, match.
   *   - best candidate already waited past patience? don't starve them, match.
   *   - otherwise hold out for a better (interest-based) match.
   */
  _selectImmediate(searcher, ranked) {
    if (ranked.length === 0) return null;
    const best = ranked[0];
    if (best.overlap > 0) return best;
    if (searcher.interests.length === 0) return best;
    const candidateWaited = Date.now() - best.entry.joinedAt >= this._patienceMs;
    return candidateWaited ? best : null;
  }

  /**
   * Background safety net: pair anyone who has waited past patience with the
   * best partner available, so no-overlap waiters still connect. Cooldown is
   * still respected — better to wait a few more seconds than to be dropped
   * straight back to the partner you just skipped.
   */
  _sweep() {
    const now = Date.now();
    const ripe = this._pool.snapshot().filter((e) => now - e.joinedAt >= this._patienceMs);
    if (ripe.length === 0) return;

    let matchedAny = false;
    for (const entry of ripe) {
      if (!this._pool.has(entry.id)) continue; // already paired earlier this sweep

      const ranked = rankCandidates(
        { id: entry.id, interests: entry.interests },
        this._pool.snapshot(),
        { isBlocked: (other) => this._rooms.inCooldown(entry.id, other.id) },
      );
      if (ranked.length === 0) continue;

      const partner = ranked[0].entry;
      this._pool.remove(entry.id);
      this._pool.remove(partner.id);
      this._rooms.createRoom(entry.socket, partner.socket);
      matchedAny = true;
    }

    if (matchedAny) this._onCountChange();
  }
}

module.exports = MatchmakingService;
