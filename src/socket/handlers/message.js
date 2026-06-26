const events = require("../events");

// Relay a chat message to the room partner only. The server never stores
// messages — it's a pure relay. Payload shape kept as { event, message } for
// backward compatibility with existing clients.
module.exports = function message(socket, matchmaking) {
  return (payload) => {
    const roomId = matchmaking.roomIdFor(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit(events.CHAT_MESSAGE, {
      event: events.CHAT_MESSAGE,
      message: payload && payload.message,
    });
  };
};
