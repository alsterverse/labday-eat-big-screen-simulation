/**
 * DQN Inference Module for JavaScript
 *
 * Pure JavaScript implementation of the DQN forward pass.
 * No external dependencies required.
 *
 * Usage (Browser):
 *   const model = await DQN.load('blob1_weights.json');
 *   const qValues = model.predict([x, y, angle, mass, distOther, angleOther, otherMass, distFood, angleFood]);
 *   const action = model.getAction(qValues); // 0 = left, 1 = right
 *
 * Usage (Node.js):
 *   const DQN = require('./dqn_inference.js');
 *   const model = await DQN.load('./blob1_weights.json');
 *   const qValues = model.predict(state);
 */

const DQN = (function () {
  /**
   * ReLU activation function
   */
  function relu(x) {
    return Math.max(0, x);
  }

  /**
   * Linear layer: output = input @ weight.T + bias
   * @param {number[]} input - Input vector
   * @param {number[][]} weight - Weight matrix [out_features x in_features]
   * @param {number[]} bias - Bias vector [out_features]
   * @returns {number[]} Output vector
   */
  function linear(input, weight, bias) {
    const output = [];
    for (let i = 0; i < weight.length; i++) {
      let sum = bias[i];
      for (let j = 0; j < input.length; j++) {
        sum += weight[i][j] * input[j];
      }
      output.push(sum);
    }
    return output;
  }

  /**
   * DQN Model class
   */
  class Model {
    constructor(weights) {
      this.weights = weights;
    }

    /**
     * Run forward pass through the network
     * @param {number[]} state - Input state vector (8 or 9 features)
     * @returns {number[]} Q-values for each action [left, right]
     */
    predict(state) {
      // Layer 1: Linear + ReLU
      let x = linear(state, this.weights.fc1.weight, this.weights.fc1.bias);
      x = x.map(relu);

      // Layer 2: Linear + ReLU
      x = linear(x, this.weights.fc2.weight, this.weights.fc2.bias);
      x = x.map(relu);

      // Layer 3: Linear (output)
      x = linear(x, this.weights.fc3.weight, this.weights.fc3.bias);

      return x;
    }

    /**
     * Get the best action (argmax of Q-values)
     * @param {number[]} qValues - Q-values from predict()
     * @returns {number} Best action index (0 = left, 1 = right)
     */
    getAction(qValues) {
      let maxIdx = 0;
      let maxVal = qValues[0];
      for (let i = 1; i < qValues.length; i++) {
        if (qValues[i] > maxVal) {
          maxVal = qValues[i];
          maxIdx = i;
        }
      }
      return maxIdx;
    }
  }

  /**
   * Load model weights from a JSON file
   * Works in both browser (fetch) and Node.js (fs)
   * @param {string} path - Path or URL to the weights JSON file
   * @returns {Promise<Model>} Loaded model
   */
  async function load(path) {
    let weights;

    if (typeof window !== "undefined") {
      // Browser environment
      const response = await fetch(path);
      weights = await response.json();
    } else {
      // Node.js environment
      const fs = await import("fs");
      const data = fs.readFileSync(path, "utf8");
      weights = JSON.parse(data);
    }

    return new Model(weights);
  }

  // Export public API
  return {
    load,
    Model,
  };
})();

// CommonJS export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = DQN;
}
