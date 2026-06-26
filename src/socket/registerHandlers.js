const events = require("./events");
const findPeer = require("./handlers/findPeer");
const skipPeer = require("./handlers/skipPeer");
const signal = require("./handlers/signal");
const message = require("./handlers/message");
const disconnect = require("./handlers/disconnect");

// Attach every event listener for a single connected socket. Each handler is a
// thin factory bound to (socket, matchmaking) — they delegate all state changes
// to the matchmaking service and never touch the pool or rooms directly.
function registerHandlers(socket, { matchmaking }) {
  socket.on(events.FIND_PEER, findPeer(socket, matchmaking));
  socket.on(events.SKIP_PEER, skipPeer(socket, matchmaking));
  socket.on(events.SIGNAL, signal(socket, matchmaking));
  socket.on(events.SEND_MESSAGE, message(socket, matchmaking));
  socket.on(events.DISCONNECT, disconnect(socket, matchmaking));
}

module.exports = registerHandlers;
