/**
 * Main Game Loop
 * Initializes and runs the blob compete demo
 */

(async function () {
  // State
  let model1 = null;
  let model2 = null;
  let paused = false;
  let done = false;
  let lastTime = 0;
  let resetTimer = 0;

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

    // Initialize game
    Game.reset();

    // Set up keyboard controls
    setupControls();

    // Handle window resize
    window.addEventListener("resize", () => {
      Renderer.resize();
    });

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(loop);

    console.log("Initialization complete. Press SPACE to pause, R to reset.");
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
          Game.reset();
          done = false;
          resetTimer = 0;
          break;
        case "KeyQ":
        case "Escape":
          // Could close window if in electron, otherwise just log
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
        Game.reset();
        done = false;
      }
    }

    // Run simulation with delta time
    if (!paused && !done) {
      // Get observations
      const state1 = Game.getObservation(0);
      const state2 = Game.getObservation(1);

      // Run inference
      const qValues1 = model1.predict(state1);
      const qValues2 = model2.predict(state2);
      const action1 = model1.getAction(qValues1);
      const action2 = model2.getAction(qValues2);

      // Step simulation with delta time
      const result = Game.step(action1, action2, dt);

      // Handle events
      for (const event of result.events) {
        if (event.type === "foodCollected") {
          Renderer.triggerBounce(event.blobId);
          Renderer.playEatSound();
        } else if (event.type === "death") {
          const state = Game.getState();
          const blob = state.blobs[event.blobId];
          const screen = Renderer.worldToScreen(blob.x, blob.y);
          Renderer.spawnExplosion(screen.x, screen.y, event.blobId);
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
    UI.update(Game.getStats());

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
