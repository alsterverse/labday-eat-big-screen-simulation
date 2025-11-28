/**
 * Blob Compete Server
 * Express + WebSocket server for shared simulation
 */

const express = require("express");
const http = require("http");
const path = require("path");
const GameServer = require("./game-server");
const WebSocketHandler = require("./websocket-handler");

const PORT = process.env.PORT || 3000;

async function main() {
  const app = express();
  const server = http.createServer(app);

  // Initialize game server
  const gameServer = new GameServer();
  await gameServer.init();

  // Initialize WebSocket handler
  const wsHandler = new WebSocketHandler(server, gameServer);

  // Serve static client files
  const clientDir = path.join(__dirname, "..", "client");
  app.use("/js", express.static(path.join(clientDir, "js")));
  app.use("/assets", express.static(path.join(clientDir, "assets")));

  // Routes
  app.get("/", (req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });

  app.get("/play", (req, res) => {
    res.sendFile(path.join(clientDir, "play.html"));
  });

  // Start game loop
  gameServer.start();

  // Start server
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`  Spectator: http://localhost:${PORT}/`);
    console.log(`  Player:    http://localhost:${PORT}/play`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    gameServer.stop();
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
