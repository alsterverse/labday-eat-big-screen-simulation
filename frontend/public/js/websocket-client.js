/**
 * WebSocket Client for Blob Compete
 */

const WebSocketClient = (function () {
  let ws = null;
  let clientId = null;
  let blobIndex = -1;
  let callbacks = {};
  let reconnectAttempts = 0;
  let currentCharacter = null;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000;

  function connect(isPlayerMode, character, onInit, onState, onEvent, onDisconnect, onKickedToSpectate) {
    callbacks = { onInit, onState, onEvent, onDisconnect, onKickedToSpectate };
    currentCharacter = character;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    let path = isPlayerMode ? "/ws/play" : "/ws/";
    if (character) {
      path += `?character=${encodeURIComponent(character)}`;
    }
    const wsUrl = `${protocol}//${location.host}${path}`;

    console.log("Connecting to:", wsUrl);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      if (callbacks.onDisconnect) {
        callbacks.onDisconnect();
      }

      // Attempt reconnection
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})...`);
        setTimeout(() => {
          connect(isPlayerMode, currentCharacter, onInit, onState, onEvent, onDisconnect, callbacks.onKickedToSpectate);
        }, RECONNECT_DELAY);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }

  function handleMessage(message) {
    switch (message.type) {
      case "init":
        clientId = message.clientId;
        blobIndex = message.yourBlobIndex;
        console.log(`Initialized as ${clientId}, blob index: ${blobIndex}`);
        if (callbacks.onInit) {
          callbacks.onInit({
            clientId,
            blobIndex,
            state: message.state,
            stats: message.stats,
          });
        }
        break;

      case "state":
        if (callbacks.onState) {
          callbacks.onState({
            blobs: message.blobs,
            foods: message.foods,
            mapSize: message.mapSize,
            agentRadius: message.agentRadius,
            stats: message.stats,
          });
        }
        break;

      case "event":
        if (callbacks.onEvent) {
          callbacks.onEvent(message.event);
        }
        break;

      case "yourBlobIndex":
        blobIndex = message.blobIndex;
        console.log("Updated blob index:", blobIndex);
        if (callbacks.onInit) {
          callbacks.onInit({ blobIndex });
        }
        break;

      case "pong":
        // Handle latency measurement if needed
        break;

      case "kickedToSpectate":
        blobIndex = -1;
        console.log("Kicked to spectate:", message.reason);
        if (callbacks.onKickedToSpectate) {
          callbacks.onKickedToSpectate(message);
        }
        break;
    }
  }

  function sendAction(action) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "action", action }));
    }
  }

  function disconnect() {
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent reconnection
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  function getBlobIndex() {
    return blobIndex;
  }

  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  return {
    connect,
    sendAction,
    disconnect,
    getBlobIndex,
    isConnected,
  };
})();
