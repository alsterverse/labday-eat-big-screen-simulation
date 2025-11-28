/**
 * Game State & Physics Engine
 * Port of blob_env.py to JavaScript
 */

const Game = (function () {
  // Game constants (matching Python environment)
  // Base rates are per-step at 30 Hz, we scale by dt
  const MAP_SIZE = 100.0;
  const AGENT_RADIUS = 2.5;
  const INITIAL_MASS = 5.0;
  const BASE_MASS_DECAY = 0.05 * 30; // per second (0.05 per step * 30 steps/sec)
  const BASE_SPEED = 1.2 * 30; // per second
  const BASE_TURN_RATE = 0.12 * 30; // per second
  const FOOD_GAIN = 1.5;
  const MIN_MASS = 0.5;
  const MAX_FOODS = 10;
  const MAX_STEPS = 2000;

  // Game state
  let blobs = [];
  let foods = [];
  let steps = 0;
  let episode = 1;
  let wins = [0, 0, 0]; // Support up to 3 blobs
  let terminated = false;
  let winner = null;

  /**
   * Normalize angle to [-PI, PI]
   */
  function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  /**
   * Calculate distance between two points
   */
  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate angle from point a to point b
   */
  function angleTo(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /**
   * Spawn a food pellet at random position
   */
  function spawnFood() {
    const margin = 5;
    return {
      x: margin + Math.random() * (MAP_SIZE - 2 * margin),
      y: margin + Math.random() * (MAP_SIZE - 2 * margin),
    };
  }

  /**
   * Create a new blob at a random position
   */
  function createBlob() {
    const margin = 10;
    return {
      x: margin + Math.random() * (MAP_SIZE - 2 * margin),
      y: margin + Math.random() * (MAP_SIZE - 2 * margin),
      angle: Math.random() * 2 * Math.PI - Math.PI,
      mass: INITIAL_MASS,
      foodsCollected: 0,
      alive: true,
    };
  }

  /**
   * Initialize/reset the game state
   */
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

    return {
      observations: blobs.map((_, i) => getObservation(i)),
    };
  }

  /**
   * Add a new blob (e.g., player blob)
   * @returns {number} The index of the new blob
   */
  function addBlob() {
    const blob = createBlob();
    blobs.push(blob);
    return blobs.length - 1;
  }

  /**
   * Remove a blob by index
   * @param {number} blobId - Index of blob to remove
   */
  function removeBlob(blobId) {
    if (blobId >= 0 && blobId < blobs.length) {
      blobs.splice(blobId, 1);
    }
  }

  /**
   * Get the number of blobs
   */
  function getBlobCount() {
    return blobs.length;
  }

  /**
   * Get observation for a specific blob (8 features)
   */
  function getObservation(blobId) {
    const blob = blobs[blobId];
    if (!blob) return [0, 0, 0, 0, 1, 0, 1, 0];

    const maxDist = Math.sqrt(2) * MAP_SIZE;

    // Find nearest other blob
    let distToOther = 1.0;
    let angleToOther = 0.0;
    let minDistOther = Infinity;
    for (let i = 0; i < blobs.length; i++) {
      if (i !== blobId && blobs[i].alive) {
        const d = distance(blob, blobs[i]);
        if (d < minDistOther) {
          minDistOther = d;
          distToOther = d / maxDist;
          angleToOther = normalizeAngle(angleTo(blob, blobs[i]) - blob.angle);
        }
      }
    }

    // Find nearest food
    let distToFood = 1.0;
    let angleToFood = 0.0;
    if (foods.length > 0) {
      let minDist = Infinity;
      let nearestFood = null;
      for (const food of foods) {
        const d = distance(blob, food);
        if (d < minDist) {
          minDist = d;
          nearestFood = food;
        }
      }
      if (nearestFood) {
        distToFood = minDist / maxDist;
        angleToFood = normalizeAngle(angleTo(blob, nearestFood) - blob.angle);
      }
    }

    return [
      blob.x / MAP_SIZE, // 0: normalized x position
      blob.y / MAP_SIZE, // 1: normalized y position
      blob.angle, // 2: heading angle (-PI to PI)
      blob.mass / 10.0, // 3: normalized mass
      distToOther, // 4: normalized distance to nearest opponent
      angleToOther, // 5: relative angle to nearest opponent
      distToFood, // 6: normalized distance to nearest food
      angleToFood, // 7: relative angle to nearest food
    ];
  }

  /**
   * Execute one simulation step with delta time
   * @param {number[]} actions - Actions for each blob (0=left, 1=right)
   * @param {number} dt - Delta time in seconds
   * @returns {object} Step result with observations, rewards, events
   */
  function step(actions, dt) {
    if (terminated) {
      return {
        observations: blobs.map((_, i) => getObservation(i)),
        rewards: blobs.map(() => 0),
        done: true,
        events: [],
      };
    }

    const events = [];

    // Scale physics by delta time
    const turnRate = BASE_TURN_RATE * dt;
    const speed = BASE_SPEED * dt;
    const massDecay = BASE_MASS_DECAY * dt;

    // Update each blob
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      if (!blob.alive) continue;

      const action = actions[i];

      // Apply steering (action 0 = add angle, action 1 = subtract)
      if (action === 0) {
        blob.angle += turnRate;
      } else {
        blob.angle -= turnRate;
      }
      blob.angle = normalizeAngle(blob.angle);

      // Move forward
      blob.x += Math.cos(blob.angle) * speed;
      blob.y += Math.sin(blob.angle) * speed;

      // Wrap around edges (toroidal world)
      if (blob.x < 0) blob.x += MAP_SIZE;
      if (blob.x >= MAP_SIZE) blob.x -= MAP_SIZE;
      if (blob.y < 0) blob.y += MAP_SIZE;
      if (blob.y >= MAP_SIZE) blob.y -= MAP_SIZE;

      // Mass decay
      blob.mass -= massDecay;
    }

    // Check food collisions
    const foodCollisionRadius = AGENT_RADIUS + 1.0;
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      for (let j = 0; j < blobs.length; j++) {
        const blob = blobs[j];
        if (!blob.alive) continue;
        if (distance(blob, food) < foodCollisionRadius) {
          // Blob collected food
          blob.mass += FOOD_GAIN;
          blob.foodsCollected++;
          events.push({ type: "foodCollected", blobId: j, food: { ...food } });
          // Replace food
          foods[i] = spawnFood();
          break;
        }
      }
    }

    // Initialize rewards
    let rewards = blobs.map((b) => (b.alive ? 0.01 : 0)); // Base survival reward

    // Check for death
    for (let i = 0; i < blobs.length; i++) {
      if (blobs[i].alive && blobs[i].mass <= MIN_MASS) {
        blobs[i].alive = false;
        events.push({ type: "death", blobId: i });
        rewards[i] = 0;

        // Check if only one blob remains (AI blobs only for win counting)
        const aliveAIBlobs = blobs.slice(0, 2).filter((b) => b.alive);
        if (aliveAIBlobs.length === 1) {
          const winnerIdx = blobs.slice(0, 2).findIndex((b) => b.alive);
          if (winnerIdx !== -1) {
            terminated = true;
            winner = winnerIdx;
            wins[winner]++;
            episode++;
            rewards[winnerIdx] = 1; // Winner bonus
          }
        } else if (aliveAIBlobs.length === 0) {
          // Both AI blobs dead
          terminated = true;
          winner = null;
          episode++;
        }
      }
    }

    // Add food collection rewards
    for (const event of events) {
      if (event.type === "foodCollected") {
        rewards[event.blobId] += 5.0;
      }
    }

    steps++;

    // Check for timeout (truncation)
    const truncated = steps >= MAX_STEPS;
    if (truncated && !terminated) {
      terminated = true;
      winner = null; // Draw
      episode++;
    }

    return {
      observations: blobs.map((_, i) => getObservation(i)),
      rewards: rewards,
      done: terminated || truncated,
      truncated: truncated,
      events: events,
    };
  }

  /**
   * Get current game state for rendering
   */
  function getState() {
    return {
      blobs: blobs.map((b) => ({ ...b })),
      foods: foods.map((f) => ({ ...f })),
      mapSize: MAP_SIZE,
      agentRadius: AGENT_RADIUS,
    };
  }

  /**
   * Get statistics for UI
   */
  function getStats() {
    return {
      episode: episode,
      steps: steps,
      maxSteps: MAX_STEPS,
      wins: [...wins],
      blobs: blobs.map((b) => ({
        mass: b.mass,
        foodsCollected: b.foodsCollected,
      })),
      terminated: terminated,
      winner: winner,
    };
  }

  // Export public API
  return {
    reset,
    step,
    getObservation,
    getState,
    getStats,
    addBlob,
    removeBlob,
    getBlobCount,
    MAP_SIZE,
    AGENT_RADIUS,
    INITIAL_MASS,
  };
})();
