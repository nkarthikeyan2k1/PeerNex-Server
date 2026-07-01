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

Configuration is read from environment variables (a local `.env` is loaded automatically).

## Socket.IO event contract

### Client → server

| Event         | Payload                    | Effect                                                              |
| ------------- | -------------------------- | ------------------------------------------------------------------- |
| `findPeer`    | `{ interests?: string[] }` | Join matchmaking. Interests are optional — omit for a random match. |
| `skipPeer`    | —                          | Leave the current room (partner gets `peerLeft`) and stop matching. |
| `signal`      | `{ signal }`               | Relay WebRTC SDP/ICE to the room partner.                           |
| `sendMessage` | `{ message }`              | Relay a chat message to the room partner.                           |

### Server → client

| Event             | Payload                        | Meaning                                                                           |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `matched`         | `{ roomId, isInitiator }`      | Paired. The `isInitiator: true` peer creates the WebRTC offer; the other answers. |
| `peerLeft`        | —                              | Your partner skipped or disconnected.                                             |
| `signal`          | `{ signal }`                   | Incoming WebRTC signal from your partner.                                         |
| `chatMessage`     | `{ event, message }`           | Incoming chat message from your partner.                                          |
| `userCountUpdate` | `{ totalUsers, waitingUsers }` | Live counts (debounced), broadcast to everyone.                                   |

## Architecture

Layered: bootstrap → transport (`src/socket`) → matching domain (`src/matching`).

## System design

### Architecture

Two browsers connect over WebSocket to one Socket.IO server. The server is both the **matchmaker**
(pairs strangers into rooms) and the **relay** (forwards WebRTC signaling + chat between the pair).
Handlers stay thin — they delegate to `MatchmakingService`, which owns all in-memory state.

```
                              peernex-server  (:3001)
   ┌─────────────────────────────────────────────────────────────────────┐
   │                                                                     │
   │   Peer A ─┐                    ┌──────────────────────────────┐     │
   │           │      WebSocket     │  Socket.IO server            │     │
   │           ├───────────────────▶│  registerHandlers            │     │
   │   Peer B ─┘                    │  handlers/*.js  (thin)       │     │
   │                                └───────────────┬──────────────┘     │
   │                                                │  delegate          │
   │                                                ▼                    │
   │                                ┌──────────────────────────────┐     │
   │                                │  MatchmakingService          │     │
   │                                │  requestMatch · cancel        │    │
   │                                │  handleDisconnect · sweep     │    │
   │                                └──┬──────────┬──────────┬──────┘    │
   │                                   │          │          │           │
   │                       ┌───────────┘          │          └────────┐  │
   │                       ▼                      ▼                   ▼  │
   │               ┌──────────────┐      ┌──────────────┐    ┌───────────┐
   │               │ WaitingPool  │      │ RoomManager  │    │ score.js  │
   │               │ waiting users│      │ rooms +      │    │ rank by   │
   │               │ (FIFO Map)   │      │ cooldown     │    │ overlap   │
   │               └──────────────┘      └──────────────┘    └───────────┘
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘
```

- **Transport (`src/socket`):** the Socket.IO server + per-socket handlers. Handlers never touch
  state — they just call `MatchmakingService`. `Presence` broadcasts debounced `userCountUpdate`.
- **Domain (`src/matching`):** `WaitingPool` (who's waiting), `RoomManager` (active rooms + the
  recent-partner cooldown), and `score.js` (pure interest-overlap ranking).
- **State lives only in `WaitingPool` + `RoomManager`** — the single seam to swap for Redis later.

### Matchmaking flow — what happens on `findPeer`

`requestMatch` clears any prior room/queue spot, ranks the waiting pool by shared-interest overlap
(ties → longest waiter first, skipping self + cooldown partners), then decides: pair now, or wait.
A background **sweep** guarantees no-overlap waiters still connect once they pass patience.

```
   findPeer { interests }
         │
         ▼  cancel any prior room / queue spot
         │
         ▼  rank waiting pool by shared-interest overlap
         │  (tie-break: longest waiter · skip self + cooldown)
         │
         ▼
   ┌───────────────────────────┐
   │ pool empty?               │── yes ─────────────────┐
   └───────────┬───────────────┘                        │
               │ no                                      │
               ▼                                         │
   ┌───────────────────────────┐                        │
   │ best has shared interest? │── yes ──▶ CREATE ROOM   │
   └───────────┬───────────────┘             ▲           │
               │ no                           │           │
               ▼                              │           │
   ┌───────────────────────────┐             │           │
   │ searcher gave no interest?│── yes ──────┤           │
   └───────────┬───────────────┘             │           │
               │ no                           │           │
               ▼                              │           │
   ┌───────────────────────────┐             │           │
   │ best waited past patience?│── yes ──────┘           │
   └───────────┬───────────────┘                         │
               │ no                                       │
               ▼                                          ▼
        join WaitingPool  ◀───────────────────  join WaitingPool
               │
               ▼
   background sweep (every MATCH_SWEEP_INTERVAL_MS ≈ 2s)
   pairs anyone past MATCH_PATIENCE_MS with the best partner ──▶ CREATE ROOM
```

`CREATE ROOM` pairs the two sockets and emits `matched` to both — exactly **one** peer gets
`isInitiator: true` so only one WebRTC offer is created (prevents offer "glare").

### WebRTC signaling — two peers connect

After `matched`, the peers hand-shake through the server, then media flows **peer-to-peer** — the
server is never in the media path. Chat is relayed but never stored.

```
   Peer A (isInitiator: true)        Server         Peer B (isInitiator: false)
        │                              │                     │
        │◀──── matched {room, true} ───│─ matched {room,false} ─▶│
        │                              │                     │
        │── signal { offer SDP } ─────▶│                     │
        │                              │── signal {offer} ──▶│
        │                              │                     │─ creates answer
        │                              │◀─ signal {answer} ──│
        │◀──── signal { answer SDP } ──│                     │
        │                              │                     │
        │── signal { ICE } ───────────▶│── signal { ICE } ──▶│
        │◀──── signal { ICE } ─────────│◀─ signal { ICE } ───│
        │                              │                     │
        │════════ WebRTC P2P media (server not in path) ═════│
        │                              │                     │
        │── sendMessage { msg } ──────▶│── chatMessage ─────▶│
        │                              │                     │
        │                              │◀─ skipPeer / disconnect
        │◀──── peerLeft ───────────────│   (room torn down;
        │                              │    pair put on cooldown)
```

### Room lifecycle

```
   connect ─▶ Idle ──── findPeer ────▶ Waiting ──── matched ────▶ Paired
              ▲  ▲                        │                         │
              │  └──── findPeer (immediate match) ─────────────────┤
              │                                                     │
              └──── skipPeer (partner gets peerLeft) ──────────────┘
                                                                    │
                        disconnect (partner gets peerLeft) ─────────┘

   Paired partners are put on RECENT_PARTNER_COOLDOWN_MS so the smart-random
   fallback won't immediately re-pair two people who just split.
```
