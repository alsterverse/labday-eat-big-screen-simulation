/**
 * Game State & Physics Engine (Server Version)
 * Port of blob_env.py to JavaScript, adapted for Node.js
 */

const { Quadtree } = require("./quadtree");

// Game constants (matching Python environment)
const MAP_SIZE = 100.0;
const AGENT_RADIUS = 2.5;
const INITIAL_MASS = 5.0;
const BASE_MASS_DECAY = 0.05 * 30; // per second
const BASE_SPEED = 1.2 * 30; // per second
const BASE_TURN_RATE = 0.12 * 30; // per second
const FOOD_GAIN = 1.5;
const MIN_MASS = 0.5;
const MAX_FOODS = 10;
const MAX_STEPS = 2000;

/**
 * Create a new Game instance
 */
function createGame() {
  // Game state
  let blobs = [];
  let foods = [];
  let steps = 0;
  let episode = 1;
  let wins = [0, 0, 0]; // Support up to 3+ blobs
  let terminated = false;
  let winner = null;
  let playerActions = new Map(); // Buffer for player actions

  // Spatial partitioning for O(log n) queries
  const treeBounds = { x: 0, y: 0, width: MAP_SIZE, height: MAP_SIZE };
  const blobTree = new Quadtree(treeBounds, 8, 6);
  const foodTree = new Quadtree(treeBounds, 8, 6);

  // Cached observations to avoid redundant computation
  let cachedObservations = null;

  // Pre-allocated buffers for getState() to reduce GC pressure
  const stateBuffer = {
    blobs: [],
    foods: [],
    mapSize: MAP_SIZE,
    agentRadius: AGENT_RADIUS,
  };

  // Pre-allocated buffers for getStats()
  const statsBuffer = {
    episode: 0,
    steps: 0,
    maxSteps: MAX_STEPS,
    wins: [0, 0, 0],
    blobs: [],
    terminated: false,
    winner: null,
  };

  /**
   * Rebuild spatial trees with current entity positions
   */
  function rebuildTrees() {
    blobTree.clear();
    foodTree.clear();

    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      if (blob.alive) {
        blobTree.insert({ x: blob.x, y: blob.y, id: i, blob });
      }
    }

    for (let i = 0; i < foods.length; i++) {
      const food = foods[i];
      foodTree.insert({ x: food.x, y: food.y, id: i, food });
    }
  }

  function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function angleTo(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function spawnFood() {
    const margin = 5;
    return {
      x: margin + Math.random() * (MAP_SIZE - 2 * margin),
      y: margin + Math.random() * (MAP_SIZE - 2 * margin),
    };
  }

  function createBlob(aiControlled = true) {
    const margin = 10;
    return {
      x: margin + Math.random() * (MAP_SIZE - 2 * margin),
      y: margin + Math.random() * (MAP_SIZE - 2 * margin),
      angle: Math.random() * 2 * Math.PI - Math.PI,
      mass: INITIAL_MASS,
      foodsCollected: 0,
      alive: true,
      aiControlled: aiControlled,
    };
  }

  function reset() {
    // Reset to 2 AI blobs
    blobs = [createBlob(), createBlob()];

    // Spawn initial foods
    foods = [];
    for (let i = 0; i < MAX_FOODS; i++) {
      foods.push(spawnFood());
    }

    steps = 0;
    terminated = false;
    winner = null;
    playerActions.clear();

    return {
      observations: blobs.map((_, i) => getObservation(i)),
    };
  }

  function addBlob(aiControlled = false) {
    const blob = createBlob(aiControlled);
    blobs.push(blob);
    return blobs.length - 1;
  }

  function removeBlob(blobId) {
    if (blobId >= 0 && blobId < blobs.length) {
      blobs.splice(blobId, 1);
      // Clear any buffered action for this blob
      playerActions.delete(blobId);
      // Reindex remaining player actions
      const newActions = new Map();
      for (const [idx, action] of playerActions) {
        if (idx > blobId) {
          newActions.set(idx - 1, action);
        } else {
          newActions.set(idx, action);
        }
      }
      playerActions = newActions;
    }
  }

  function respawnBlob(blobId) {
    if (blobId >= 0 && blobId < blobs.length) {
      const margin = 10;
      blobs[blobId] = {
        x: margin + Math.random() * (MAP_SIZE - 2 * margin),
        y: margin + Math.random() * (MAP_SIZE - 2 * margin),
        angle: Math.random() * 2 * Math.PI - Math.PI,
        mass: INITIAL_MASS,
        foodsCollected: 0,
        alive: true,
      };
      return true;
    }
    return false;
  }

  function getBlobCount() {
    return blobs.length;
  }

  /**
   * Compute observation for a blob (internal, uncached)
   */
  function computeObservation(blobId) {
    const blob = blobs[blobId];
    if (!blob) return [0, 0, 0, 0, 1, 0, 1, 0];

    const maxDist = Math.sqrt(2) * MAP_SIZE;

    // Find nearest other blob using quadtree
    let distToOther = 1.0;
    let angleToOther = 0.0;
    const nearestBlobResult = blobTree.findNearest(blob.x, blob.y, blobId);
    if (nearestBlobResult) {
      const d = Math.sqrt(nearestBlobResult.distSq);
      distToOther = d / maxDist;
      angleToOther = normalizeAngle(angleTo(blob, nearestBlobResult.point) - blob.angle);
    }

    // Find nearest food using quadtree
    let distToFood = 1.0;
    let angleToFood = 0.0;
    const nearestFoodResult = foodTree.findNearest(blob.x, blob.y);
    if (nearestFoodResult) {
      const d = Math.sqrt(nearestFoodResult.distSq);
      distToFood = d / maxDist;
      angleToFood = normalizeAngle(angleTo(blob, nearestFoodResult.point) - blob.angle);
    }

    return [
      blob.x / MAP_SIZE,
      blob.y / MAP_SIZE,
      blob.angle,
      blob.mass / 10.0,
      distToOther,
      angleToOther,
      distToFood,
      angleToFood,
    ];
  }

  /**
   * Get observation for a blob, using cache if available
   */
  function getObservation(blobId) {
    if (cachedObservations && cachedObservations[blobId]) {
      return cachedObservations[blobId];
    }
    return computeObservation(blobId);
  }

  /**
   * Set a player's action for the next step
   */
  function setPlayerAction(blobId, action) {
    playerActions.set(blobId, action);
  }

  /**
   * Get the buffered action for a blob
   */
  function getPlayerAction(blobId) {
    return playerActions.get(blobId);
  }

  /**
   * Set the character for a blob
   */
  function setBlobCharacter(blobId, character) {
    if (blobId >= 0 && blobId < blobs.length) {
      blobs[blobId].character = character;
    }
  }

  function step(actions, dt) {
    // Invalidate observation cache at start of step
    cachedObservations = null;

    if (terminated) {
      return {
        observations: blobs.map((_, i) => getObservation(i)),
        rewards: blobs.map(() => 0),
        done: true,
        events: [],
      };
    }

    const events = [];

    const turnRate = BASE_TURN_RATE * dt;
    const speed = BASE_SPEED * dt;
    const massDecay = BASE_MASS_DECAY * dt;

    // Update each blob
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      if (!blob.alive) continue;

      const action = actions[i];

      if (action === 0) {
        blob.angle += turnRate;
      } else if (action === 1) {
        blob.angle -= turnRate;
      }
      // action === 2: no angle change (go straight)
      blob.angle = normalizeAngle(blob.angle);

      blob.x += Math.cos(blob.angle) * speed;
      blob.y += Math.sin(blob.angle) * speed;

      if (blob.x < 0) blob.x += MAP_SIZE;
      if (blob.x >= MAP_SIZE) blob.x -= MAP_SIZE;
      if (blob.y < 0) blob.y += MAP_SIZE;
      if (blob.y >= MAP_SIZE) blob.y -= MAP_SIZE;

      blob.mass -= massDecay;
    }

    // Rebuild spatial trees after movement
    rebuildTrees();

    // Check food collisions using quadtree (O(n log n) instead of O(n²))
    const foodCollisionRadius = AGENT_RADIUS + 1.0;
    const foodCollisionRadiusSq = foodCollisionRadius * foodCollisionRadius;
    const collidedFoodIds = new Set();

    for (let j = 0; j < blobs.length; j++) {
      const blob = blobs[j];
      if (!blob.alive) continue;

      // Query foods near this blob
      const nearbyFoods = foodTree.queryCircle(blob.x, blob.y, foodCollisionRadius);

      for (const foodPoint of nearbyFoods) {
        if (collidedFoodIds.has(foodPoint.id)) continue;

        const dx = blob.x - foodPoint.x;
        const dy = blob.y - foodPoint.y;
        if (dx * dx + dy * dy < foodCollisionRadiusSq) {
          blob.mass += FOOD_GAIN;
          blob.foodsCollected++;
          events.push({ type: "foodCollected", blobId: j, food: { x: foodPoint.x, y: foodPoint.y } });
          collidedFoodIds.add(foodPoint.id);
        }
      }
    }

    // Respawn collided foods
    for (const foodId of collidedFoodIds) {
      foods[foodId] = spawnFood();
    }

    let rewards = blobs.map((b) => (b.alive ? 0.01 : 0));

    // Check for death
    for (let i = 0; i < blobs.length; i++) {
      if (blobs[i].alive && blobs[i].mass <= MIN_MASS) {
        blobs[i].alive = false;
        events.push({ type: "death", blobId: i });
        rewards[i] = 0;

        // Check if only one AI blob remains (first 2 are AI)
        const aliveAIBlobs = blobs.slice(0, 2).filter((b) => b.alive);
        if (aliveAIBlobs.length === 1) {
          const winnerIdx = blobs.slice(0, 2).findIndex((b) => b.alive);
          if (winnerIdx !== -1) {
            terminated = true;
            winner = winnerIdx;
            wins[winner]++;
            episode++;
            rewards[winnerIdx] = 1;
          }
        } else if (aliveAIBlobs.length === 0) {
          terminated = true;
          winner = null;
          episode++;
        }
      }
    }

    for (const event of events) {
      if (event.type === "foodCollected") {
        rewards[event.blobId] += 5.0;
      }
    }

    steps++;

    const truncated = steps >= MAX_STEPS;
    if (truncated && !terminated) {
      terminated = true;
      winner = null;
      episode++;
    }

    // Compute and cache observations once
    cachedObservations = blobs.map((_, i) => computeObservation(i));

    return {
      observations: cachedObservations,
      rewards: rewards,
      done: terminated || truncated,
      truncated: truncated,
      events: events,
    };
  }

  function getState() {
    // Reuse pre-allocated buffer arrays, resize only if needed
    while (stateBuffer.blobs.length < blobs.length) {
      stateBuffer.blobs.push({});
    }
    stateBuffer.blobs.length = blobs.length;

    while (stateBuffer.foods.length < foods.length) {
      stateBuffer.foods.push({});
    }
    stateBuffer.foods.length = foods.length;

    // Copy blob data into buffer
    for (let i = 0; i < blobs.length; i++) {
      const src = blobs[i];
      const dst = stateBuffer.blobs[i];
      dst.x = src.x;
      dst.y = src.y;
      dst.angle = src.angle;
      dst.mass = src.mass;
      dst.foodsCollected = src.foodsCollected;
      dst.alive = src.alive;
      dst.aiControlled = src.aiControlled;
      dst.character = src.character;
    }

    // Copy food data into buffer
    for (let i = 0; i < foods.length; i++) {
      const src = foods[i];
      const dst = stateBuffer.foods[i];
      dst.x = src.x;
      dst.y = src.y;
    }

    return stateBuffer;
  }

  function getStats() {
    // Reuse pre-allocated buffer, resize blobs array only if needed
    while (statsBuffer.blobs.length < blobs.length) {
      statsBuffer.blobs.push({});
    }
    statsBuffer.blobs.length = blobs.length;

    // Update scalar values
    statsBuffer.episode = episode;
    statsBuffer.steps = steps;
    statsBuffer.terminated = terminated;
    statsBuffer.winner = winner;

    // Copy wins array
    for (let i = 0; i < wins.length; i++) {
      statsBuffer.wins[i] = wins[i];
    }

    // Copy blob stats into buffer
    for (let i = 0; i < blobs.length; i++) {
      const src = blobs[i];
      const dst = statsBuffer.blobs[i];
      dst.mass = src.mass;
      dst.foodsCollected = src.foodsCollected;
      dst.alive = src.alive;
      dst.aiControlled = src.aiControlled;
      dst.character = src.character;
    }

    return statsBuffer;
  }

  /**
   * Get full serializable state for WebSocket transmission
   */
  function getFullState() {
    return {
      state: getState(),
      stats: getStats(),
    };
  }

  return {
    reset,
    step,
    getObservation,
    getState,
    getStats,
    getFullState,
    addBlob,
    removeBlob,
    respawnBlob,
    getBlobCount,
    setPlayerAction,
    getPlayerAction,
    setBlobCharacter,
    MAP_SIZE,
    AGENT_RADIUS,
    INITIAL_MASS,
  };
}

module.exports = {
  createGame,
  MAP_SIZE,
  AGENT_RADIUS,
  INITIAL_MASS,
  MAX_STEPS,
};
