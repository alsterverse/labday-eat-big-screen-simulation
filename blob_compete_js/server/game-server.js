/**
 * Game Server - Manages authoritative game state and tick loop
 */

const path = require("path");
const { createGame } = require("./shared/game");
const DQN = require("./shared/dqn");
const { AIController } = require("./shared/controller");

const TICK_RATE = 30; // Server ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;
const BROADCAST_RATE = 20; // State broadcasts per second
const BROADCAST_INTERVAL = 1000 / BROADCAST_RATE;
const RESET_DELAY = 2000; // 2 seconds between episodes

class GameServer {
  constructor() {
    this.game = createGame();
    this.aiControllers = [];
    this.players = new Map(); // clientId -> { blobIndex, lastAction }
    this.onBroadcast = null; // Callback for broadcasting state
    this.onEvent = null; // Callback for game events

    this.lastTick = Date.now();
    this.lastBroadcast = Date.now();
    this.tickInterval = null;
    this.resetTimer = null;
    this.done = false;
  }

  async init() {
    const weightsDir = path.join(__dirname, "..", "weights");

    console.log("Loading DQN models...");
    const model1 = DQN.load(path.join(weightsDir, "blob1_weights.json"));
    const model2 = DQN.load(path.join(weightsDir, "blob2_weights.json"));

    this.aiControllers = [new AIController(model1), new AIController(model2)];

    this.game.reset();
    console.log("Game initialized with 2 AI blobs");
  }

  start() {
    console.log(`Starting game loop at ${TICK_RATE}Hz`);
    this.lastTick = Date.now();
    this.lastBroadcast = Date.now();
    this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;

    if (this.done) {
      return;
    }

    // Collect actions from all blobs
    const blobCount = this.game.getBlobCount();
    const actions = [];

    for (let i = 0; i < blobCount; i++) {
      const observation = this.game.getObservation(i);

      if (i < this.aiControllers.length) {
        // AI blob
        actions.push(this.aiControllers[i].getAction(observation));
      } else {
        // Player blob - use buffered action or default (alternate)
        const playerAction = this.game.getPlayerAction(i);
        if (playerAction !== undefined) {
          actions.push(playerAction);
        } else {
          // Default: alternate to go straight
          actions.push(Math.random() < 0.5 ? 0 : 1);
        }
      }
    }

    // Step simulation
    const result = this.game.step(actions, dt);

    // Emit events
    if (this.onEvent) {
      for (const event of result.events) {
        this.onEvent(event);
      }
    }

    // Check for episode end
    if (result.done && !this.done) {
      this.done = true;

      // Schedule reset
      this.resetTimer = setTimeout(() => {
        this.resetGame();
      }, RESET_DELAY);
    }

    // Broadcast state at lower rate
    if (now - this.lastBroadcast >= BROADCAST_INTERVAL) {
      this.lastBroadcast = now;
      if (this.onBroadcast) {
        this.onBroadcast(this.getStateForBroadcast());
      }
    }
  }

  resetGame() {
    const playerClientIds = Array.from(this.players.keys());

    this.game.reset();
    this.done = false;
    this.resetTimer = null;

    // Re-add all connected players
    this.players.clear();
    for (const clientId of playerClientIds) {
      this.addPlayerInternal(clientId);
    }

    // Broadcast reset event
    if (this.onEvent) {
      this.onEvent({ type: "episodeReset" });
    }

    // Immediate state broadcast
    if (this.onBroadcast) {
      this.onBroadcast(this.getStateForBroadcast());
    }

    console.log(
      `Episode reset. ${this.players.size} players rejoined.`
    );
  }

  addPlayerInternal(clientId) {
    const blobIndex = this.game.addBlob();
    this.players.set(clientId, { blobIndex, lastAction: null });
    return blobIndex;
  }

  addPlayer(clientId) {
    if (this.players.has(clientId)) {
      return this.players.get(clientId).blobIndex;
    }

    const blobIndex = this.addPlayerInternal(clientId);
    console.log(
      `Player ${clientId} joined as blob ${blobIndex} (total: ${this.game.getBlobCount()})`
    );

    if (this.onEvent) {
      this.onEvent({ type: "playerJoined", clientId, blobIndex });
    }

    return blobIndex;
  }

  removePlayer(clientId) {
    const player = this.players.get(clientId);
    if (!player) return;

    const removedIndex = player.blobIndex;
    this.game.removeBlob(removedIndex);
    this.players.delete(clientId);

    // Update indices for remaining players
    for (const [id, p] of this.players) {
      if (p.blobIndex > removedIndex) {
        p.blobIndex--;
      }
    }

    console.log(
      `Player ${clientId} left (was blob ${removedIndex}, remaining: ${this.game.getBlobCount()})`
    );

    if (this.onEvent) {
      this.onEvent({ type: "playerLeft", clientId, blobIndex: removedIndex });
    }

    // Notify affected players of their new indices
    return { removedIndex };
  }

  setPlayerAction(clientId, action) {
    const player = this.players.get(clientId);
    if (player) {
      player.lastAction = action;
      this.game.setPlayerAction(player.blobIndex, action);
    }
  }

  getPlayerBlobIndex(clientId) {
    const player = this.players.get(clientId);
    return player ? player.blobIndex : -1;
  }

  getStateForBroadcast() {
    const state = this.game.getState();
    const stats = this.game.getStats();
    return {
      timestamp: Date.now(),
      blobs: state.blobs,
      foods: state.foods,
      mapSize: state.mapSize,
      agentRadius: state.agentRadius,
      stats: stats,
    };
  }

  getFullState() {
    return this.game.getFullState();
  }

  getPlayerIndices() {
    const indices = {};
    for (const [clientId, player] of this.players) {
      indices[clientId] = player.blobIndex;
    }
    return indices;
  }
}

module.exports = GameServer;
