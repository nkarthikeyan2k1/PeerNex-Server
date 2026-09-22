const express = require("express");
const cors = require("cors");

const config = require("./config");

// The Express application: middleware + plain HTTP routes. Kept separate from
// the server bootstrap (src/index.js) and the Socket.IO layer (src/socket) so
// each part can be reasoned about — and tested — on its own.
function createApp() {
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));

  app.get("/healthCheck", (req, res) => {
    res.send("OK");
  });

  // Lightweight keep-alive endpoint. Point an external uptime monitor (e.g.
  // UptimeRobot, cron-job.org) at /ping every 14 minutes so Render's free
  // tier never goes to sleep and cold-starts don't hit your users.
  app.get("/ping", (req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  return app;
}

module.exports = { createApp };
