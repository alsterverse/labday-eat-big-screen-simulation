/**
 * Client Main - Entry point for both spectator and player modes
 */

(function () {
  // Determine mode from URL query param
  function getIsPlayerMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "play";
  }

  /**
   * Fetch visitor token from server and store as session cookie.
   * Required to join as a player (spam bot prevention).
   */
  async function ensureVisitorToken() {
    // Check if we already have a visitor token cookie
    if (document.cookie.includes("visitor_token=")) {
      return;
    }

    try {
      const response = await fetch("/api/visitor-token");
      if (!response.ok) {
        console.warn("Failed to fetch visitor token:", response.status);
        return;
      }
      const data = await response.json();
      // Set as session cookie (no expiry = session only)
      document.cookie = `visitor_token=${data.token}; path=/; SameSite=Strict`;
    } catch (err) {
      console.warn("Failed to fetch visitor token:", err);
    }
  }

  let isPlayerMode = getIsPlayerMode();
  let playerBlobIndex = -1;
  let connected = false;
  let gameConstants = { mapSize: 100, initialMass: 5.0 };
  let initialized = false;
  let selectedCharacter = null;

  function setupCharacterSelection() {
    const overlay = document.getElementById("character-select-overlay");
    const cards = document.querySelectorAll(".character-card");

    // Show the overlay
    overlay.classList.remove("hidden");

    // Remove old listeners by cloning cards
    cards.forEach(card => {
      const newCard = card.cloneNode(true);
      card.parentNode.replaceChild(newCard, card);
    });

    // Add fresh listeners
    document.querySelectorAll(".character-card").forEach(card => {
      card.addEventListener("click", () => {
        selectedCharacter = card.dataset.character;
        overlay.classList.add("hidden");
        connectToServer();
      });
    });
  }

  function connectToServer() {
    WebSocketClient.connect(
      isPlayerMode,
      selectedCharacter,
      handleInit,
      handleState,
      handleEvent,
      handleDisconnect,
      handleKickedToSpectate
    );
  }

  async function init() {
    console.log(`Initializing in ${isPlayerMode ? "player" : "spectator"} mode...`);

    // Ensure visitor token is set (required to join as player)
    await ensureVisitorToken();

    // Initialize UI
    UI.init();
    UI.setPlayerMode(isPlayerMode);
    UI.setConnectionStatus(false);
    UI.updateModeToggle(isPlayerMode);

    // Update body class for CSS mode switching
    document.body.classList.toggle("player-mode", isPlayerMode);

    // Initialize renderer only once
    if (!initialized) {
      const canvas = document.getElementById("game-canvas");
      await Renderer.init(canvas);

      // Handle window resize
      window.addEventListener("resize", () => {
        Renderer.resize();
      });
    }

    // Reset state
    playerBlobIndex = -1;
    Interpolator.reset();

    // In player mode, wait for character selection before connecting
    if (isPlayerMode) {
      setupCharacterSelection();
    } else {
      // Spectator mode: connect immediately
      connectToServer();
    }

    // Start render loop only once
    if (!initialized) {
      requestAnimationFrame(renderLoop);
      initialized = true;
    }

    console.log("Client initialized");
  }

  function switchMode() {
    // Toggle mode
    isPlayerMode = !isPlayerMode;

    // Update URL without reload
    const url = new URL(window.location.href);
    if (isPlayerMode) {
      url.searchParams.set("mode", "play");
    } else {
      url.searchParams.delete("mode");
    }
    history.pushState({}, "", url);

    // Deactivate player input
    PlayerInput.deactivate();

    // Disconnect current WebSocket
    WebSocketClient.disconnect();

    // Reinitialize with new mode
    init();
  }

  // Expose switchMode globally for the button
  window.switchMode = switchMode;

  function handleInit(data) {
    console.log("Received init:", data);
    connected = true;
    UI.setConnectionStatus(true);

    if (data.blobIndex !== undefined) {
      playerBlobIndex = data.blobIndex;
      UI.setPlayerMode(playerBlobIndex !== -1);
    }

    if (data.state) {
      gameConstants.mapSize = data.state.mapSize || 100;
      gameConstants.initialMass = 5.0; // Default
      Renderer.setGameConstants(gameConstants.mapSize, gameConstants.initialMass);

      // Push initial state
      Interpolator.pushState({
        blobs: data.state.blobs,
        foods: data.state.foods,
        mapSize: data.state.mapSize,
        agentRadius: data.state.agentRadius,
        stats: data.stats,
      });

      UI.update(data.stats, playerBlobIndex);
    }

    // Activate player input if in player mode
    if (isPlayerMode && playerBlobIndex !== -1) {
      PlayerInput.activate((action) => {
        WebSocketClient.sendAction(action);
      });
    }
  }

  function handleState(state) {
    Interpolator.pushState(state);
    UI.update(state.stats, playerBlobIndex);
  }

  function handleEvent(event) {
    switch (event.type) {
      case "foodCollected": {
        Renderer.triggerBounce(event.blobId);
        Renderer.playEatSound();
        const currentState = Interpolator.getInterpolatedState();
        if (currentState && currentState.blobs[event.blobId]?.character === "linda") {
          Renderer.triggerSpin(event.blobId);
        }
        break;
      }

      case "death": {
        const currentState = Interpolator.getInterpolatedState();
        if (currentState && currentState.blobs[event.blobId]) {
          const blob = currentState.blobs[event.blobId];
          const screen = Renderer.worldToScreen(blob.x, blob.y);
          Renderer.spawnExplosion(screen.x, screen.y, event.blobId);
        }
        break;
      }

      case "episodeReset":
        console.log("Episode reset");
        Interpolator.reset();
        break;

      case "playerJoined":
        console.log(`Player joined: ${event.clientId} as blob ${event.blobIndex}`);
        break;

      case "playerLeft":
        console.log(`Player left: ${event.clientId} (was blob ${event.blobIndex})`);
        break;
    }
  }

  function handleDisconnect() {
    connected = false;
    UI.setConnectionStatus(false);
    PlayerInput.deactivate();
  }

  function handleKickedToSpectate() {
    // Update mode to spectator
    isPlayerMode = false;
    playerBlobIndex = -1;

    // Deactivate player input
    PlayerInput.deactivate();

    // Update UI
    UI.setPlayerMode(false);
    UI.updateModeToggle(false);
    document.body.classList.remove("player-mode");

    // Update URL (remove mode=play param)
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    history.pushState({}, "", url);
  }

  let lastTime = performance.now();

  function renderLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Update animations
    Renderer.updateAnimations(dt);
    Renderer.updateParticles(dt);

    // Render interpolated state
    const state = Interpolator.getInterpolatedState();
    if (state) {
      Renderer.render(state, playerBlobIndex);
    }

    requestAnimationFrame(renderLoop);
  }

  // Start
  init().catch((err) => {
    console.error("Initialization failed:", err);
    document.body.innerHTML = `
      <div style="color: red; padding: 20px; font-family: monospace;">
        <h2>Initialization Failed</h2>
        <p>${err.message}</p>
      </div>
    `;
  });
})();
