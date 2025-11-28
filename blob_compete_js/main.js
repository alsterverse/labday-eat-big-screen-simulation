/**
 * Main Game Loop
 * Initializes and runs the blob compete demo
 */

(async function () {
  // State
  let controllers = []; // Dynamic array of controllers
  let playerController = null;
  let playerBlobIndex = -1; // Index of player blob (-1 = not playing)
  let paused = false;
  let done = false;
  let lastTime = 0;
  let resetTimer = 0;

  // Store models
  let model1 = null;
  let model2 = null;

  /**
   * Initialize the application
   */
  async function init() {
    console.log("Initializing Blob Compete JS...");

    // Initialize UI
    UI.init();

    // Initialize renderer
    const canvas = document.getElementById("game-canvas");
    await Renderer.init(canvas);

    // Load DQN models
    console.log("Loading DQN models...");
    model1 = await DQN.load("weights/blob1_weights.json");
    model2 = await DQN.load("weights/blob2_weights.json");
    console.log("Models loaded successfully");

    // Create player controller
    playerController = new Controller.PlayerController();

    // Initialize game (starts in spectator mode)
    resetGame();

    // Set up keyboard controls
    setupControls();

    // Handle window resize
    window.addEventListener("resize", () => {
      Renderer.resize();
    });

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(loop);

    console.log("Initialization complete. Press SPACE to pause, R to reset, J to join/leave.");
  }

  /**
   * Reset the game state
   */
  function resetGame() {
    const wasPlaying = playerBlobIndex !== -1;

    Game.reset();

    // Set up AI controllers for the two AI blobs
    controllers = [
      new Controller.AIController(model1),
      new Controller.AIController(model2),
    ];

    // Reset player index before respawning
    playerBlobIndex = -1;

    // If player was in game, respawn them
    if (wasPlaying) {
      spawnPlayer();
    }

    done = false;
    resetTimer = 0;
  }

  /**
   * Spawn player blob
   */
  function spawnPlayer() {
    if (playerBlobIndex !== -1) return; // Already in game

    // Add new blob to game
    playerBlobIndex = Game.addBlob();

    // Add player controller
    controllers.push(playerController);
    playerController.activate();

    UI.setPlayerMode(true);
    console.log("Player joined as blob", playerBlobIndex + 1);
  }

  /**
   * Remove player blob (spectator mode)
   */
  function despawnPlayer() {
    if (playerBlobIndex === -1) return; // Not in game

    // Remove player blob from game
    Game.removeBlob(playerBlobIndex);

    // Remove player controller
    controllers.splice(playerBlobIndex, 1);
    playerController.deactivate();

    playerBlobIndex = -1;
    UI.setPlayerMode(false);
    console.log("Player left - spectator mode");
  }

  /**
   * Toggle player in/out of game
   */
  function togglePlayer() {
    if (playerBlobIndex === -1) {
      spawnPlayer();
    } else {
      despawnPlayer();
    }
  }

  /**
   * Set up keyboard controls
   */
  function setupControls() {
    document.addEventListener("keydown", (e) => {
      switch (e.code) {
        case "Space":
          e.preventDefault();
          paused = !paused;
          UI.setPaused(paused);
          break;
        case "KeyR":
          resetGame();
          break;
        case "KeyJ":
          // Join/leave game
          togglePlayer();
          break;
        case "KeyQ":
        case "Escape":
          console.log("Quit requested");
          break;
      }
    });
  }

  /**
   * Main game loop with delta time
   */
  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // Delta time in seconds, capped
    lastTime = timestamp;

    // Handle reset timer
    if (done && resetTimer > 0) {
      resetTimer -= dt;
      if (resetTimer <= 0) {
        resetGame();
      }
    }

    // Run simulation with delta time
    if (!paused && !done) {
      // Get actions from all controllers
      const actions = [];
      for (let i = 0; i < controllers.length; i++) {
        const observation = Game.getObservation(i);
        actions.push(controllers[i].getAction(observation));
      }

      // Step simulation with delta time
      const result = Game.step(actions, dt);

      // Handle events
      for (const event of result.events) {
        if (event.type === "foodCollected") {
          Renderer.triggerBounce(event.blobId);
          Renderer.playEatSound();
        } else if (event.type === "death") {
          const state = Game.getState();
          const blob = state.blobs[event.blobId];
          if (blob) {
            const screen = Renderer.worldToScreen(blob.x, blob.y);
            Renderer.spawnExplosion(screen.x, screen.y, event.blobId);
          }

          // If player died, mark them as dead but keep index
          // They'll respawn on reset
        }
      }

      // Check if episode ended
      if (result.done) {
        done = true;
        resetTimer = 2.0; // 2 second delay before reset
      }
    }

    // Update animations
    Renderer.updateAnimations(dt);
    Renderer.updateParticles(dt);

    // Render
    Renderer.render(Game.getState());
    UI.update(Game.getStats(), playerBlobIndex);

    // Continue loop
    requestAnimationFrame(loop);
  }

  // Start the application
  init().catch((err) => {
    console.error("Initialization failed:", err);
    document.body.innerHTML = `
      <div style="color: red; padding: 20px; font-family: monospace;">
        <h2>Initialization Failed</h2>
        <p>${err.message}</p>
        <p>Make sure you're running this from a local server (e.g., python -m http.server)</p>
      </div>
    `;
  });
})();
