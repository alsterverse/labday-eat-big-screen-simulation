/**
 * Blob Compete Backend Server
 * WebSocket server for shared simulation with static file serving for local dev
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const GameServer = require("./game-server");
const WebSocketHandler = require("./websocket-handler");

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "../../frontend/public");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0]; // Remove query string

  // Route mapping for clean URLs
  if (urlPath === "/") urlPath = "/index.html";
  else if (urlPath === "/play") urlPath = "/play.html";

  let filePath = path.join(FRONTEND_DIR, urlPath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function main() {
  const server = http.createServer(serveStatic);

  // Initialize game server
  const gameServer = new GameServer();
  await gameServer.init();

  // Initialize WebSocket handler
  const wsHandler = new WebSocketHandler(server, gameServer);

  // Start game loop
  gameServer.start();

  // Start server
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`  Spectator: http://localhost:${PORT}/`);
    console.log(`  Player:    http://localhost:${PORT}/play.html`);
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
