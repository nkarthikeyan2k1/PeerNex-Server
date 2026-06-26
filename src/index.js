const http = require("http");

const config = require("./config");
const logger = require("./lib/logger");
const { createApp } = require("./app");
const { initSocket } = require("./socket");

// Bootstrap: build the app, wrap it in an HTTP server, attach Socket.IO, listen.
const app = createApp();
const server = http.createServer(app);

initSocket(server);

server.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
});
