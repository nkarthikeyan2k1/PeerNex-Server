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

  return app;
}

module.exports = { createApp };
