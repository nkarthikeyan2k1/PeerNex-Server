// Skip the current partner but stay connected. Tears down the room (the partner
// gets peerLeft) and drops any queue spot. The client typically follows up with
// a fresh findPeer.
module.exports = function skipPeer(socket, matchmaking) {
  return () => {
    matchmaking.cancel(socket);
  };
};
