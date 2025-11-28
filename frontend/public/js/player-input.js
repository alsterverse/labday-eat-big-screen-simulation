/**
 * Player Input Handler
 */

const PlayerInput = (function () {
  let keys = { left: false, right: false };
  let onActionCallback = null;
  let actionInterval = null;
  let lastAction = null;
  let isMobile = false;

  // Detect if device is mobile
  function detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
  }

  function handleKeyDown(e) {
    if (e.code === "KeyA") {
      keys.left = true;
    } else if (e.code === "KeyD") {
      keys.right = true;
    }
  }

  function handleKeyUp(e) {
    if (e.code === "KeyA") {
      keys.left = false;
    } else if (e.code === "KeyD") {
      keys.right = false;
    }
  }

  function handleTouchStart(e) {
    if (!isMobile) return;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const canvas = document.getElementById('game-canvas');
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const centerX = rect.width / 2;

      if (x < centerX) {
        keys.left = true;
        keys.right = false;
      } else {
        keys.right = true;
        keys.left = false;
      }
    }
    e.preventDefault();
  }

  function handleTouchEnd(e) {
    if (!isMobile) return;

    // If no touches remain, stop turning
    if (e.touches.length === 0) {
      keys.left = false;
      keys.right = false;
    }
    e.preventDefault();
  }

  function sendAction() {
    let action;
    if (keys.left && !keys.right) {
      action = 1; // Turn left
    } else if (keys.right && !keys.left) {
      action = 0; // Turn right
    } else {
      action = 2; // Go straight
    }

    // Only send if action changed or on regular interval
    if (onActionCallback) {
      onActionCallback(action);
    }
    lastAction = action;
  }

  function activate(callback) {
    isMobile = detectMobile();
    onActionCallback = callback;
    keys = { left: false, right: false };
    lastAction = null;

    if (isMobile) {
      // Touch controls for mobile
      const canvas = document.getElementById('game-canvas');
      canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
      canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
      canvas.addEventListener("touchmove", handleTouchStart, { passive: false });
    } else {
      // Keyboard controls for desktop
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
    }

    // Send actions at 30Hz
    actionInterval = setInterval(sendAction, 1000 / 30);
  }

  function deactivate() {
    const canvas = document.getElementById('game-canvas');

    if (isMobile) {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchmove", handleTouchStart);
    } else {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    }

    if (actionInterval) {
      clearInterval(actionInterval);
      actionInterval = null;
    }

    keys = { left: false, right: false };
    onActionCallback = null;
  }

  function isMobileDevice() {
    return isMobile;
  }

  return {
    activate,
    deactivate,
    isMobileDevice,
  };
})();
