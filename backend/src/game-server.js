/**
 * Game Server - Manages authoritative game state and tick loop
 */

const path = require("path");
const { createGame } = require("./shared/game");
const DQN = require("./shared/dqn");
const { AIController } = require("./shared/controller");

const TICK_RATE = 30; // Server ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;
const BROADCAST_RATE = 20; // State broadcasts per second (default)
const BROADCAST_INTERVAL = 1000 / BROADCAST_RATE;
const RESET_DELAY = 2000; // 2 seconds between episodes
const PLAYER_RESPAWN_DELAY = 3000; // 3 seconds before player respawns

// Adaptive broadcast rate settings
const MIN_BROADCAST_INTERVAL = 50;  // 20Hz max (smoothest)
const MAX_BROADCAST_INTERVAL = 200; // 5Hz min (under heavy load)
const TICK_DURATION_HIGH = 25;      // ms - consider reducing broadcast rate
const TICK_DURATION_LOW = 15;       // ms - consider increasing broadcast rate

class GameServer {
  constructor() {
    this.game = createGame();
    this.aiControllers = [];
    this.players = new Map(); // clientId -> { blobIndex, lastAction }
    this.onBroadcast = null; // Callback for broadcasting state
    this.onEvent = null; // Callback for game events
    this.onKickInactivePlayers = null; // Callback for kicking inactive players
    this.playersWithTurningActions = new Set(); // clientIds who have turned this episode

    this.lastTick = Date.now();
    this.lastBroadcast = Date.now();
    this.tickInterval = null;
    this.resetTimer = null;
    this.respawnTimers = new Map(); // clientId -> timer
    this.done = false;

    // Adaptive broadcast rate
    this.currentBroadcastInterval = BROADCAST_INTERVAL;
    this.lastTickDuration = 0;
    this.tickDurationSmoothed = 0; // Exponential moving average
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
    const tickStart = Date.now();
    const now = tickStart;
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
          // Default: go straight
          actions.push(2);
        }
      }
    }

    // Step simulation
    const result = this.game.step(actions, dt);

    // Emit events (dead players will respawn when episode resets)
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

    // Measure tick duration and adapt broadcast rate
    this.lastTickDuration = Date.now() - tickStart;
    this.tickDurationSmoothed = 0.9 * this.tickDurationSmoothed + 0.1 * this.lastTickDuration;

    // Adjust broadcast interval based on server load
    if (this.tickDurationSmoothed > TICK_DURATION_HIGH) {
      // Server is under heavy load, reduce broadcast rate
      this.currentBroadcastInterval = Math.min(
        MAX_BROADCAST_INTERVAL,
        this.currentBroadcastInterval + 5
      );
    } else if (this.tickDurationSmoothed < TICK_DURATION_LOW) {
      // Server has headroom, increase broadcast rate
      this.currentBroadcastInterval = Math.max(
        MIN_BROADCAST_INTERVAL,
        this.currentBroadcastInterval - 2
      );
    }

    // Broadcast state at adaptive rate
    if (now - this.lastBroadcast >= this.currentBroadcastInterval) {
      this.lastBroadcast = now;
      if (this.onBroadcast) {
        this.onBroadcast(this.getStateForBroadcast());
      }
    }
  }

  resetGame() {
    // Identify inactive players (those who never made a turning action)
    const inactivePlayers = [];
    for (const [clientId] of this.players) {
      if (!this.playersWithTurningActions.has(clientId)) {
        inactivePlayers.push(clientId);
      }
    }

    // Kick inactive players before reset
    if (inactivePlayers.length > 0 && this.onKickInactivePlayers) {
      this.onKickInactivePlayers(inactivePlayers);
    }

    // Clear tracking for new episode
    this.playersWithTurningActions.clear();

    // Save player characters before clearing
    const playerData = Array.from(this.players.entries()).map(([clientId, data]) => ({
      clientId,
      character: data.character,
    }));

    this.game.reset();
    this.done = false;
    this.resetTimer = null;

    // Re-add all connected players with their characters
    this.players.clear();
    for (const { clientId, character } of playerData) {
      this.addPlayerInternal(clientId, character);
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

  addPlayerInternal(clientId, character) {
    const blobIndex = this.game.addBlob(false); // false = not AI controlled
    this.game.setBlobCharacter(blobIndex, character);
    this.players.set(clientId, { blobIndex, lastAction: null, character });
    return blobIndex;
  }

  addPlayer(clientId, character) {
    if (this.players.has(clientId)) {
      return this.players.get(clientId).blobIndex;
    }

    const blobIndex = this.addPlayerInternal(clientId, character);
    console.log(
      `Player ${clientId} (${character}) joined as blob ${blobIndex} (total: ${this.game.getBlobCount()})`
    );

    if (this.onEvent) {
      this.onEvent({ type: "playerJoined", clientId, blobIndex, character });
    }

    return blobIndex;
  }

  removePlayer(clientId) {
    const player = this.players.get(clientId);
    if (!player) return;

    // Clear any pending respawn timer
    if (this.respawnTimers.has(clientId)) {
      clearTimeout(this.respawnTimers.get(clientId));
      this.respawnTimers.delete(clientId);
    }

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

  schedulePlayerRespawn(blobId) {
    // Only respawn player blobs (index >= 2, since first 2 are AI)
    if (blobId < 2) return;

    // Find the clientId for this blobId
    let clientIdToRespawn = null;
    for (const [clientId, player] of this.players) {
      if (player.blobIndex === blobId) {
        clientIdToRespawn = clientId;
        break;
      }
    }

    if (!clientIdToRespawn) return;

    // Clear any existing respawn timer
    if (this.respawnTimers.has(clientIdToRespawn)) {
      clearTimeout(this.respawnTimers.get(clientIdToRespawn));
    }

    // Schedule respawn
    const timer = setTimeout(() => {
      this.respawnTimers.delete(clientIdToRespawn);

      // Check if player is still connected
      const player = this.players.get(clientIdToRespawn);
      if (!player) return;

      // Respawn the blob
      if (this.game.respawnBlob(player.blobIndex)) {
        console.log(`Player ${clientIdToRespawn} respawned as blob ${player.blobIndex}`);

        if (this.onEvent) {
          this.onEvent({
            type: "playerRespawned",
            clientId: clientIdToRespawn,
            blobIndex: player.blobIndex,
          });
        }
      }
    }, PLAYER_RESPAWN_DELAY);

    this.respawnTimers.set(clientIdToRespawn, timer);
  }

  setPlayerAction(clientId, action) {
    const player = this.players.get(clientId);
    if (player) {
      player.lastAction = action;
      this.game.setPlayerAction(player.blobIndex, action);

      // Track turning actions (0 = turn right, 1 = turn left)
      if (action === 0 || action === 1) {
        this.playersWithTurningActions.add(clientId);
      }
    }
  }

  getPlayerBlobIndex(clientId) {
    const player = this.players.get(clientId);
    return player ? player.blobIndex : -1;
  }

  getStateForBroadcast() {
    const state = this.game.getState();
    const stats = this.game.getStats();

    // Build blobIndex→player lookup map (O(m) once, then O(1) per blob)
    const blobToPlayer = new Map();
    for (const [, player] of this.players) {
      blobToPlayer.set(player.blobIndex, player);
    }

    // Add character info to blobs using lookup (O(n) instead of O(n*m))
    const blobsWithCharacter = state.blobs.map((blob, index) => {
      const player = blobToPlayer.get(index);
      return player ? { ...blob, character: player.character } : blob;
    });

    return {
      timestamp: Date.now(),
      blobs: blobsWithCharacter,
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
