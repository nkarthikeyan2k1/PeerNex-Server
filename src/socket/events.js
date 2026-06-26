// Centralized Socket.IO event names. Import these instead of typing string
// literals so the client/server contract lives in one place and typos surface
// as undefined references rather than silently-dead listeners.
module.exports = Object.freeze({
  // Connection lifecycle (Socket.IO built-ins). The server accepts sockets on
  // "connection"; each socket signals teardown with "disconnect".
  CONNECTION: "connection",
  DISCONNECT: "disconnect",

  // Client -> server
  FIND_PEER: "findPeer",
  SKIP_PEER: "skipPeer",
  SEND_MESSAGE: "sendMessage",

  // Server -> client
  MATCHED: "matched",
  PEER_LEFT: "peerLeft",
  CHAT_MESSAGE: "chatMessage",
  USER_COUNT_UPDATE: "userCountUpdate",

  // Bidirectional (WebRTC signaling relay)
  SIGNAL: "signal",
});
