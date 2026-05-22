// Socket setup module
const { Server } = require("socket.io");

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const user_socket_map = new Map();

  io.on('connect', (socket) => {
    user_socket_map.set(socket.id, socket.id);
    console.log("User connected", user_socket_map);

    socket.on('disconnect', () => {
      user_socket_map.delete(socket.id);
      console.log("User disconnected", socket.id);
      socket.disconnect();
    });

    socket.on('send-message', (message) => {
      socket.broadcast.emit('chat message', {
        message,
        senderId: user_socket_map.get(socket.id),
      });
    });

    socket.on('join', (data) => {
      console.log("User joined room", data);
    });
  });

  return io;
}

module.exports = { initSocket };
