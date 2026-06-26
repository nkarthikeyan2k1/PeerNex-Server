const logger = require("../../lib/logger");

// Socket closed (tab/browser closed, network gone). Run the same cleanup as a
// skip, plus forget the socket's cooldown bookkeeping.
module.exports = function disconnect(socket, matchmaking) {
  return () => {
    logger.info("user disconnected", socket.id);
    matchmaking.handleDisconnect(socket);
  };
};
