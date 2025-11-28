/**
 * Blob Compete Backend Server
 * WebSocket server for shared simulation (no static file serving)
 */

const http = require("http");
const GameServer = require("./game-server");
const WebSocketHandler = require("./websocket-handler");

const PORT = process.env.PORT || 3000;

async function main() {
  const server = http.createServer();

  // Initialize game server
  const gameServer = new GameServer();
  await gameServer.init();

  // Initialize WebSocket handler
  const wsHandler = new WebSocketHandler(server, gameServer);

  // Start game loop
  gameServer.start();

  // Start server
  server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
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
