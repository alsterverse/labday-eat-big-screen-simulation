/**
 * Player Input Handler
 */

const PlayerInput = (function () {
  let keys = { left: false, right: false };
  let onActionCallback = null;
  let actionInterval = null;
  let lastAction = null;

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
    onActionCallback = callback;
    keys = { left: false, right: false };
    lastAction = null;

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    // Send actions at 30Hz
    actionInterval = setInterval(sendAction, 1000 / 30);
  }

  function deactivate() {
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keyup", handleKeyUp);

    if (actionInterval) {
      clearInterval(actionInterval);
      actionInterval = null;
    }

    keys = { left: false, right: false };
    onActionCallback = null;
  }

  return {
    activate,
    deactivate,
  };
})();
