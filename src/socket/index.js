const { Server } = require("socket.io");

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const waitingUsers = [];
  const activeRooms = new Map(); // roomId -> { userA, userB }
  const userRoomMap = new Map(); // socketId -> roomId
  let broadcastTimeout = null;

  // 1. Helper to clean up room and notify the other user
  function leaveCurrentRoom(socket, io) {
    const roomId = userRoomMap.get(socket.id);
    if (roomId) {
      const room = activeRooms.get(roomId);
      if (room) {
        // Find the partner socket
        const partner = room.userA.id === socket.id ? room.userB : room.userA;
        
        if (partner) {
          // Notify partner they are alone
          partner.emit('peerLeft');
          partner.leave(roomId);
          userRoomMap.delete(partner.id);
        }
        
        activeRooms.delete(roomId);
      }
      userRoomMap.delete(socket.id);
      socket.leave(roomId);
    }
  }

  // 2. Helper to remove a user from the waiting queue
  function removeFromWaiting(socket) {
    const index = waitingUsers.findIndex(s => s.id === socket.id);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
    }
  }

  function broadcastUserCount() {
    // If a broadcast is already scheduled within the current window, skip scheduling another
    if (broadcastTimeout) return;

    broadcastTimeout = setTimeout(() => {
      broadcastTimeout = null;
      
      const totalConnected = io.engine.clientsCount;
      const waitingCount = waitingUsers.length;

      io.emit('userCountUpdate', {
        totalUsers: totalConnected,
        waitingUsers: waitingCount,
      });
    }, 1000); // Limits updates to at most once per second
  }


  io.on('connect', (socket) => {
    console.log("User connected", socket.id);
    broadcastUserCount();

    // When a socket disconnects entirely (closes tab/browser)
    socket.on('disconnect', () => {
      console.log("User disconnected", socket.id);
      leaveCurrentRoom(socket, io);
      removeFromWaiting(socket);
      broadcastUserCount();
    });

    socket.on('findPeer', (data) => {
      // Clean up any existing room or waiting queue spots before matching
      leaveCurrentRoom(socket, io);
      removeFromWaiting(socket);

      waitingUsers.push(socket);
      broadcastUserCount();

      if (waitingUsers.length >= 2) {
        const userA = waitingUsers.shift();
        const userB = waitingUsers.shift();

        // Double-check if sockets are still connected before creating the room
        if (!userA.connected) {
          waitingUsers.unshift(userB);
          return;
        }
        if (!userB.connected) {
          waitingUsers.unshift(userA);
          return;
        }

        const roomId = crypto.randomUUID();
        activeRooms.set(roomId, { userA, userB });
        userRoomMap.set(userA.id, roomId);
        userRoomMap.set(userB.id, roomId);
        
        userA.join(roomId);
        userB.join(roomId);

        io.to(roomId).emit('matched', { roomId });
      }
    });

    // Explicit skip event if user wants to skip but stay connected
    socket.on('skipPeer', () => {
      leaveCurrentRoom(socket, io);
      removeFromWaiting(socket);
      broadcastUserCount();
    });

    socket.on('sendMessage', (message) => {
      const roomId = userRoomMap.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit('chatMessage', {
          event: 'chatMessage',
          message: message.message,
        });
      }
    });
  });
}

module.exports = { initSocket };