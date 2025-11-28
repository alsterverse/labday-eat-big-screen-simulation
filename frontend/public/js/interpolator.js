/**
 * State Interpolator for smooth rendering
 */

const Interpolator = (function () {
  let previousState = null;
  let currentState = null;
  let lastUpdateTime = 0;
  const SERVER_TICK_INTERVAL = 1000 / 20; // 20Hz from server

  function pushState(newState) {
    previousState = currentState;
    currentState = newState;
    lastUpdateTime = performance.now();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
  }

  function getInterpolatedState() {
    if (!currentState) return null;
    if (!previousState) return currentState;

    const elapsed = performance.now() - lastUpdateTime;
    const t = Math.min(1, elapsed / SERVER_TICK_INTERVAL);

    // Interpolate blobs
    const interpolatedBlobs = currentState.blobs.map((blob, i) => {
      const prev = previousState.blobs[i];
      if (!prev) return blob;

      return {
        ...blob,
        x: lerp(prev.x, blob.x, t),
        y: lerp(prev.y, blob.y, t),
        angle: lerpAngle(prev.angle, blob.angle, t),
        mass: lerp(prev.mass, blob.mass, t),
      };
    });

    return {
      blobs: interpolatedBlobs,
      foods: currentState.foods,
      mapSize: currentState.mapSize,
      agentRadius: currentState.agentRadius,
    };
  }

  function getCurrentStats() {
    return currentState?.stats || null;
  }

  function reset() {
    previousState = null;
    currentState = null;
    lastUpdateTime = 0;
  }

  return {
    pushState,
    getInterpolatedState,
    getCurrentStats,
    reset,
  };
})();
