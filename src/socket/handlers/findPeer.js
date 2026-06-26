const { normalizeInterests } = require("../../matching/score");

// findPeer payload: { interests?: string[] }. Interests are optional — omitting
// them just means "match me with anyone". Anything else on the payload is
// ignored. Returns the listener bound to this socket.
module.exports = function findPeer(socket, matchmaking) {
  return (data) => {
    const interests = normalizeInterests(data && data.interests);
    matchmaking.requestMatch(socket, interests);
  };
};
