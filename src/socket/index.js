const { Server } = require("socket.io");

const config = require("../config");
const logger = require("../lib/logger");
const events = require("./events");
const WaitingPool = require("../matching/WaitingPool");
const RoomManager = require("../matching/RoomManager");
const MatchmakingService = require("../matching/MatchmakingService");
const Presence = require("./presence");
const registerHandlers = require("./registerHandlers");

// Build the Socket.IO server, wire up the matchmaking domain, and attach the
// per-connection handlers. All real logic lives in ../matching and ./handlers;
// this file is just composition.
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin },
  });

  const pool = new WaitingPool();
  const rooms = new RoomManager({ cooldownMs: config.matching.recentPartnerCooldownMs });
  const matchmaking = new MatchmakingService({ pool, rooms, matching: config.matching });
  const presence = new Presence({ io, pool, debounceMs: config.presence.userCountDebounceMs });

  matchmaking.onCountChange(() => presence.schedule());
  matchmaking.start();

  io.on(events.CONNECTION, (socket) => {
    logger.info("user connected", socket.id);

    // Send the current count directly to just this socket so it shows
    // immediately — no waiting for the debounce window to fire.
    socket.emit(events.USER_COUNT_UPDATE, {
      totalUsers: io.engine.clientsCount,
      waitingUsers: pool.size(),
    });

    // Also schedule a debounced broadcast so every other connected client
    // gets the updated count after this new connection is fully registered.
    presence.schedule();

    registerHandlers(socket, { matchmaking });
  });

  return io;
}

module.exports = { initSocket };
