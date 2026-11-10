const logger = require("../lib/logger");

const MAX_ROOM_CAPACITY = 6;

function initAudioNamespace(io) {
  const audioNs = io.of("/audio");
  const usersMeta = new Map(); // socketId -> { id, name, isMuted, avatarColor, roomId }

  function broadcastRoomCounts() {
    const counts = {};
    for (const [roomId, socketIds] of audioNs.adapter.rooms.entries()) {
      if (!usersMeta.has(roomId)) {
        counts[roomId] = socketIds.size;
      }
    }
    audioNs.emit("room-counts", counts);
  }

  audioNs.on("connection", (socket) => {
    logger.info("audio user connected", socket.id);

    // Send current room counts immediately to newly connected client
    const counts = {};
    for (const [roomId, socketIds] of audioNs.adapter.rooms.entries()) {
      if (!usersMeta.has(roomId)) {
        counts[roomId] = socketIds.size;
      }
    }
    socket.emit("room-counts", counts);

    socket.on("join-room", (data) => {
      const roomId = typeof data === "string" ? data : data.roomId;
      const name = (typeof data === "object" && data.name) || "Guest";
      const avatarColor = (typeof data === "object" && data.avatarColor) || "#06b6d4";
      const isMuted = (typeof data === "object" && data.isMuted) ?? false;

      // Check current room capacity
      const room = audioNs.adapter.rooms.get(roomId);
      const currentUsersCount = room ? room.size : 0;

      if (currentUsersCount >= MAX_ROOM_CAPACITY) {
        socket.emit("room-error", {
          roomId,
          message: `This lounge is currently full (${currentUsersCount}/${MAX_ROOM_CAPACITY} users). Maximum limit is 6.`,
        });
        return;
      }

      const user = { id: socket.id, name, avatarColor, isMuted, roomId };
      usersMeta.set(socket.id, user);

      socket.join(roomId);

      // Notify others in this room
      socket.to(roomId).emit("user-joined", user);

      // Get list of existing users in the room
      const existingUsers = [];
      if (room) {
        for (const sid of room) {
          if (sid !== socket.id && usersMeta.has(sid)) {
            existingUsers.push(usersMeta.get(sid));
          }
        }
      }
      socket.emit("room-users", existingUsers);

      broadcastRoomCounts();
    });

    socket.on("leave-room", (roomId) => {
      socket.leave(roomId);
      socket.to(roomId).emit("user-left", socket.id);
      usersMeta.delete(socket.id);
      broadcastRoomCounts();
    });

    socket.on("mute-toggle", (isMuted) => {
      const u = usersMeta.get(socket.id);
      if (u) {
        u.isMuted = isMuted;
        if (u.roomId) {
          socket.to(u.roomId).emit("user-mute-change", { id: socket.id, isMuted });
        }
      }
    });

    socket.on("signal", (payload) => {
      audioNs.to(payload.to).emit("signal", {
        from: socket.id,
        signal: payload.signal,
      });
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach((roomId) => {
        if (roomId !== socket.id) {
          socket.to(roomId).emit("user-left", socket.id);
        }
      });
      usersMeta.delete(socket.id);
      broadcastRoomCounts();
    });

    socket.on("disconnect", () => {
      logger.info("audio user disconnected", socket.id);
    });
  });
}

module.exports = initAudioNamespace;
