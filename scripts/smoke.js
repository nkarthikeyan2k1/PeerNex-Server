// End-to-end smoke test for the matchmaking + signaling flow.
//
// Boots the real app + Socket.IO server in-process on a throwaway port with
// fast matchmaking tunables, then drives multiple socket.io-client connections
// through every scenario. Run with: npm run smoke
//
// Tunables MUST be set before requiring anything that pulls in src/config.
process.env.MATCH_PATIENCE_MS = "600";
process.env.MATCH_SWEEP_INTERVAL_MS = "150";
process.env.RECENT_PARTNER_COOLDOWN_MS = "1200";
process.env.USER_COUNT_DEBOUNCE_MS = "100";
process.env.LOG_LEVEL = "warn";

const http = require("http");
const assert = require("node:assert/strict");
const { io: ioClient } = require("socket.io-client");

const { createApp } = require("../src/app");
const { initSocket } = require("../src/socket");

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let counter = 0;
function connect(label) {
  const socket = ioClient(BASE, { transports: ["websocket"], forceNew: true });
  socket.label = `${label}#${++counter}`;
  return socket;
}

function once(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${socket.label}: timed out waiting for '${event}'`)),
      timeoutMs,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Resolves if `event` does NOT fire within the window; rejects if it does.
function expectSilence(socket, event, ms) {
  return new Promise((resolve, reject) => {
    const onEvent = (data) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      reject(new Error(`${socket.label}: unexpected '${event}' ${JSON.stringify(data)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, ms);
    socket.once(event, onEvent);
  });
}

async function ready(...sockets) {
  await Promise.all(sockets.map((s) => once(s, "connect")));
}

async function scenarioInterestMatch() {
  const a = connect("A");
  const b = connect("B");
  await ready(a, b);

  a.emit("findPeer", { interests: ["music", "art"] });
  await delay(40); // keep arrival order deterministic
  b.emit("findPeer", { interests: ["music"] });

  const [ma, mb] = await Promise.all([once(a, "matched"), once(b, "matched")]);
  assert.equal(ma.roomId, mb.roomId, "both peers share one roomId");
  assert.equal(
    [ma.isInitiator, mb.isInitiator].filter(Boolean).length,
    1,
    "exactly one initiator",
  );
  a.disconnect();
  b.disconnect();
  return "interest match → same room, exactly one initiator";
}

async function scenarioSignalAndMessageIsolation() {
  const a = connect("A");
  const b = connect("B");
  const c = connect("C"); // bystander, never in the room
  await ready(a, b, c);

  a.emit("findPeer", { interests: ["x"] });
  await delay(40);
  b.emit("findPeer", { interests: ["x"] });
  await Promise.all([once(a, "matched"), once(b, "matched")]);

  // Signal relay reaches the partner only.
  const partnerSignal = once(b, "signal");
  const bystanderSignal = expectSilence(c, "signal", 400);
  a.emit("signal", { signal: { type: "offer", sdp: "v=0" } });
  const got = await partnerSignal;
  assert.equal(got.signal.type, "offer", "partner receives the SDP offer");
  await bystanderSignal;

  // Chat relay reaches the partner only.
  const partnerMsg = once(b, "chatMessage");
  const bystanderMsg = expectSilence(c, "chatMessage", 400);
  a.emit("sendMessage", { message: "hello" });
  const msg = await partnerMsg;
  assert.equal(msg.message, "hello", "partner receives chat message");
  await bystanderMsg;

  a.disconnect();
  b.disconnect();
  c.disconnect();
  return "signal + chat relay reach the partner only (bystander isolated)";
}

async function scenarioSkipCooldown() {
  const a = connect("A");
  const b = connect("B");
  await ready(a, b);

  a.emit("findPeer", { interests: ["x"] });
  await delay(40);
  b.emit("findPeer", { interests: ["x"] });
  await Promise.all([once(a, "matched"), once(b, "matched")]);

  // A skips → B is told the peer left.
  const bLeft = once(b, "peerLeft");
  a.emit("skipPeer");
  await bLeft;

  // Both immediately re-queue. Within the cooldown they must NOT be re-paired.
  a.emit("findPeer", { interests: ["x"] });
  b.emit("findPeer", { interests: ["x"] });
  await Promise.all([
    expectSilence(a, "matched", 900), // < 1200ms cooldown
    expectSilence(b, "matched", 900),
  ]);

  // After the cooldown expires the sweep finally pairs them again.
  await Promise.all([once(a, "matched", 2000), once(b, "matched", 2000)]);

  a.disconnect();
  b.disconnect();
  return "skip → peerLeft + cooldown blocks re-pair, then sweep re-pairs after cooldown";
}

async function scenarioNoOverlapSweep() {
  const a = connect("A");
  const b = connect("B");
  await ready(a, b);

  // No shared interests → no immediate match; the patience sweep pairs them.
  a.emit("findPeer", { interests: ["apples"] });
  b.emit("findPeer", { interests: ["oranges"] });
  await Promise.all([
    expectSilence(a, "matched", 400), // < 600ms patience: still waiting
    expectSilence(b, "matched", 400),
  ]);
  await Promise.all([once(a, "matched", 2000), once(b, "matched", 2000)]);

  a.disconnect();
  b.disconnect();
  return "no shared interest → unmatched until sweep pairs them past patience";
}

async function scenarioHealthCheck() {
  const body = await new Promise((resolve, reject) => {
    http
      .get(`${BASE}/healthCheck`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
  assert.equal(body, "OK", "/healthCheck returns OK");
  return "/healthCheck returns OK";
}

async function main() {
  const server = http.createServer(createApp());
  initSocket(server);
  await new Promise((resolve) => server.listen(PORT, resolve));

  const scenarios = [
    scenarioInterestMatch,
    scenarioSignalAndMessageIsolation,
    scenarioSkipCooldown,
    scenarioNoOverlapSweep,
    scenarioHealthCheck,
  ];

  let failed = 0;
  for (const scenario of scenarios) {
    try {
      const summary = await scenario();
      console.log(`✔ ${summary}`);
    } catch (err) {
      failed++;
      console.error(`✖ ${scenario.name}: ${err.message}`);
    }
  }

  server.close();
  console.log(`\n${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
