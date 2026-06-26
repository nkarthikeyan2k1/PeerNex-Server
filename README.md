# PeerNex-Server

Socket.IO signaling server for the PeerNex peer-to-peer chat app. It matches strangers into
1-on-1 rooms (by shared interests, falling back to smart-random) and relays WebRTC signaling and
chat between the two peers. The server is a pure relay — media flows peer-to-peer; chat messages
are never stored.

## Run

```bash
npm install
npm run dev      # dev server on :3001 (nodemon)
npm start        # production start
npm run lint     # ESLint
npm test         # unit tests (matching logic)
npm run smoke    # end-to-end socket flow check
```

Configuration is read from environment variables (a local `.env` is loaded automatically). See the
**Configuration** section of [CLAUDE.md](CLAUDE.md) for the full list of tunables.

## Socket.IO event contract

### Client → server

| Event | Payload | Effect |
|---|---|---|
| `findPeer` | `{ interests?: string[] }` | Join matchmaking. Interests are optional — omit for a random match. |
| `skipPeer` | — | Leave the current room (partner gets `peerLeft`) and stop matching. |
| `signal` | `{ signal }` | Relay WebRTC SDP/ICE to the room partner. |
| `sendMessage` | `{ message }` | Relay a chat message to the room partner. |

### Server → client

| Event | Payload | Meaning |
|---|---|---|
| `matched` | `{ roomId, isInitiator }` | Paired. The `isInitiator: true` peer creates the WebRTC offer; the other answers. |
| `peerLeft` | — | Your partner skipped or disconnected. |
| `signal` | `{ signal }` | Incoming WebRTC signal from your partner. |
| `chatMessage` | `{ event, message }` | Incoming chat message from your partner. |
| `userCountUpdate` | `{ totalUsers, waitingUsers }` | Live counts (debounced), broadcast to everyone. |

## Architecture

Layered: bootstrap → transport (`src/socket`) → matching domain (`src/matching`). See
[CLAUDE.md](CLAUDE.md) for the full breakdown and the matching algorithm.
