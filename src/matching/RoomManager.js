const { randomUUID } = require("node:crypto");
const events = require("../socket/events");
const logger = require("../lib/logger");

// Owns the lifecycle of active peer rooms: who is paired, the reverse
// socket->room lookup, and a short "recent partner" cooldown so the
// smart-random fallback won't immediately re-pair two people who just split.
// Like WaitingPool, this is in-memory today and the seam for a Redis swap.
class RoomManager {
  constructor({ cooldownMs }) {
    this._rooms = new Map(); // roomId -> { a: socket, b: socket }
    this._userRoom = new Map(); // socketId -> roomId
    this._cooldown = new Map(); // socketId -> Map<partnerId, expiresAt>
    this._cooldownMs = cooldownMs;
  }

  /**
   * Pair two sockets into a fresh room and announce it. Exactly one peer is the
   * initiator — the WebRTC offer/answer contract depends on this: the initiator
   * creates the offer, the other answers. Two offers ("glare") is the classic
   * handshake failure this prevents.
   */
  createRoom(a, b) {
    const roomId = randomUUID();
    this._rooms.set(roomId, { a, b });
    this._userRoom.set(a.id, roomId);
    this._userRoom.set(b.id, roomId);
    a.join(roomId);
    b.join(roomId);
    a.emit(events.MATCHED, { roomId, isInitiator: true });
    b.emit(events.MATCHED, { roomId, isInitiator: false });
    logger.info("room created", roomId, `${a.id} <-> ${b.id}`);
    return roomId;
  }

  getRoomId(socketId) {
    return this._userRoom.get(socketId);
  }

  /**
   * Tear down whatever room `socket` is in. The partner is notified with
   * peerLeft, both leave the room, and the pair is put on cooldown. Returns the
   * torn-down roomId, or null if the socket wasn't in a room.
   */
  leaveRoom(socket) {
    const roomId = this._userRoom.get(socket.id);
    if (!roomId) return null;

    const room = this._rooms.get(roomId);
    this._userRoom.delete(socket.id);
    socket.leave(roomId);

    if (room) {
      const partner = room.a.id === socket.id ? room.b : room.a;
      if (partner) {
        partner.emit(events.PEER_LEFT);
        partner.leave(roomId);
        this._userRoom.delete(partner.id);
        this._recordCooldown(socket.id, partner.id);
      }
      this._rooms.delete(roomId);
    }
    return roomId;
  }

  /** True if these two were paired within the cooldown window. */
  inCooldown(idA, idB) {
    const partners = this._cooldown.get(idA);
    if (!partners) return false;
    const expiresAt = partners.get(idB);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      partners.delete(idB);
      return false;
    }
    return true;
  }

  /** Drop a departed socket's cooldown bookkeeping. */
  forget(socketId) {
    this._cooldown.delete(socketId);
  }

  roomCount() {
    return this._rooms.size;
  }

  _recordCooldown(idA, idB) {
    if (!this._cooldownMs) return;
    const expiresAt = Date.now() + this._cooldownMs;
    this._pairMap(idA).set(idB, expiresAt);
    this._pairMap(idB).set(idA, expiresAt);
  }

  _pairMap(socketId) {
    let partners = this._cooldown.get(socketId);
    if (!partners) {
      partners = new Map();
      this._cooldown.set(socketId, partners);
    }
    return partners;
  }
}

module.exports = RoomManager;
