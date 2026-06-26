const events = require("../events");
const logger = require("../../lib/logger");

// Relay WebRTC signaling (SDP offer/answer and ICE candidates) to the room
// partner. Kept as a generic passthrough so renegotiation keeps working for the
// room's whole lifetime, not just the initial handshake. Guarded so a socket
// can only signal into a room it actually belongs to.
module.exports = function signal(socket, matchmaking) {
  return (payload) => {
    const roomId = matchmaking.roomIdFor(socket.id);
    if (!roomId) {
      logger.debug("dropped signal from unroomed socket", socket.id);
      return;
    }
    if (!payload || payload.signal === undefined) {
      logger.debug("dropped empty signal from", socket.id);
      return;
    }
    socket.to(roomId).emit(events.SIGNAL, { signal: payload.signal });
  };
};
