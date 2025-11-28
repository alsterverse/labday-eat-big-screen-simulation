/**
 * WebSocket Handler - Manages client connections
 */

const { WebSocketServer } = require("ws");

let clientIdCounter = 0;

function generateClientId() {
  return `client_${++clientIdCounter}_${Date.now().toString(36)}`;
}

class WebSocketHandler {
  constructor(server, gameServer) {
    this.wss = new WebSocketServer({ server });
    this.gameServer = gameServer;
    this.clients = new Map(); // clientId -> { ws, type, blobIndex }

    this.setupGameCallbacks();
    this.setupWebSocket();
  }

  setupGameCallbacks() {
    // Broadcast state updates
    this.gameServer.onBroadcast = (state) => {
      this.broadcast({ type: "state", ...state });
    };

    // Handle game events
    this.gameServer.onEvent = (event) => {
      this.broadcast({ type: "event", event });

      // On player left, update affected players' indices
      if (event.type === "playerLeft") {
        this.updatePlayerIndices(event.blobIndex);
      }

      // On episode reset, send new indices to all players
      if (event.type === "episodeReset") {
        this.sendPlayerIndices();
      }
    };

    // Handle kicking inactive players
    this.gameServer.onKickInactivePlayers = (clientIds) => {
      for (const clientId of clientIds) {
        this.convertPlayerToSpectator(clientId);
      }
    };
  }

  convertPlayerToSpectator(clientId) {
    const client = this.clients.get(clientId);
    if (!client || client.type !== "player") return;

    // Remove player from game server
    this.gameServer.removePlayer(clientId);

    // Update client state to spectator
    client.type = "spectator";
    client.blobIndex = -1;

    // Notify the client they've been kicked to spectate
    this.send(client.ws, {
      type: "kickedToSpectate",
      reason: "inactive",
    });

    console.log(`Player ${clientId} kicked to spectate due to inactivity`);
  }

  setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      const clientId = generateClientId();
      const url = new URL(req.url, `http://${req.headers.host}`);
      const isPlayer = url.pathname === "/play" || url.pathname === "/ws/play" || url.searchParams.get("mode") === "play";
      const character = url.searchParams.get("character");

      let blobIndex = -1;
      if (isPlayer) {
        blobIndex = this.gameServer.addPlayer(clientId, character);
      }

      this.clients.set(clientId, {
        ws,
        type: isPlayer ? "player" : "spectator",
        blobIndex,
        character,
      });

      console.log(
        `Client ${clientId} connected as ${isPlayer ? "player" : "spectator"}`
      );

      // Send initial state
      const fullState = this.gameServer.getFullState();
      this.send(ws, {
        type: "init",
        clientId,
        yourBlobIndex: blobIndex,
        state: fullState.state,
        stats: fullState.stats,
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(clientId, message);
        } catch (err) {
          console.error("Invalid message from client:", err);
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(clientId);
      });

      ws.on("error", (err) => {
        console.error(`Client ${clientId} error:`, err);
      });
    });
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case "action":
        if (client.type === "player") {
          this.gameServer.setPlayerAction(clientId, message.action);
        }
        break;

      case "ping":
        this.send(client.ws, {
          type: "pong",
          timestamp: message.timestamp,
          serverTime: Date.now(),
        });
        break;
    }
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.type === "player") {
      this.gameServer.removePlayer(clientId);
    }

    this.clients.delete(clientId);
    console.log(`Client ${clientId} disconnected`);
  }

  updatePlayerIndices(removedIndex) {
    // Update blobIndex for all players with index > removedIndex
    for (const [clientId, client] of this.clients) {
      if (client.type === "player" && client.blobIndex > removedIndex) {
        client.blobIndex--;
        this.send(client.ws, {
          type: "yourBlobIndex",
          blobIndex: client.blobIndex,
        });
      }
    }
  }

  sendPlayerIndices() {
    // After reset, send updated indices to all players
    for (const [clientId, client] of this.clients) {
      if (client.type === "player") {
        const newIndex = this.gameServer.getPlayerBlobIndex(clientId);
        client.blobIndex = newIndex;
        this.send(client.ws, {
          type: "yourBlobIndex",
          blobIndex: newIndex,
        });
      }
    }
  }

  send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(data);
      }
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  getPlayerCount() {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.type === "player") count++;
    }
    return count;
  }
}

module.exports = WebSocketHandler;
