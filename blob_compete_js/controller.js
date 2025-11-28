/**
 * Controller Module
 * Unified interface for AI and player-controlled blobs
 *
 * Both controller types implement:
 *   - getAction(observation) -> 0 (left/turn +) or 1 (right/turn -)
 *   - isPlayer -> boolean
 */

const Controller = (function () {
  /**
   * AI Controller - wraps a DQN model
   */
  class AIController {
    constructor(model) {
      this.model = model;
      this.isPlayer = false;
    }

    /**
     * Get action from the AI model
     * @param {number[]} observation - State observation
     * @returns {number} Action (0=left, 1=right)
     */
    getAction(observation) {
      const qValues = this.model.predict(observation);
      return this.model.getAction(qValues);
    }
  }

  /**
   * Player Controller - uses keyboard input (A/D keys)
   */
  class PlayerController {
    constructor() {
      this.isPlayer = true;
      this.keys = {
        left: false, // A key
        right: false, // D key
      };
      this._boundKeyDown = this._handleKeyDown.bind(this);
      this._boundKeyUp = this._handleKeyUp.bind(this);
    }

    /**
     * Start listening for keyboard input
     */
    activate() {
      document.addEventListener("keydown", this._boundKeyDown);
      document.addEventListener("keyup", this._boundKeyUp);
    }

    /**
     * Stop listening for keyboard input
     */
    deactivate() {
      document.removeEventListener("keydown", this._boundKeyDown);
      document.removeEventListener("keyup", this._boundKeyUp);
      this.keys.left = false;
      this.keys.right = false;
    }

    _handleKeyDown(e) {
      if (e.code === "KeyA") {
        this.keys.left = true;
      } else if (e.code === "KeyD") {
        this.keys.right = true;
      }
    }

    _handleKeyUp(e) {
      if (e.code === "KeyA") {
        this.keys.left = false;
      } else if (e.code === "KeyD") {
        this.keys.right = false;
      }
    }

    /**
     * Get action based on current key state
     * @param {number[]} observation - State observation (unused, but kept for interface consistency)
     * @returns {number} Action (0=left, 1=right)
     */
    getAction(observation) {
      // In screen coordinates (Y down), action 0 adds angle = turns right visually
      // A = left = action 1 (subtracts from angle)
      // D = right = action 0 (adds to angle)
      // If both or neither pressed, alternate to go roughly straight
      if (this.keys.left && !this.keys.right) {
        return 1;
      } else if (this.keys.right && !this.keys.left) {
        return 0;
      } else {
        // Neither or both pressed - alternate to approximate straight movement
        this._straightToggle = !this._straightToggle;
        return this._straightToggle ? 0 : 1;
      }
    }
  }

  // Export public API
  return {
    AIController,
    PlayerController,
  };
})();

// CommonJS export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = Controller;
}
