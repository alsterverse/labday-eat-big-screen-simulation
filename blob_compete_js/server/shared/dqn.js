/**
 * DQN Inference Module for Node.js
 */

const fs = require("fs");
const path = require("path");

function relu(x) {
  return Math.max(0, x);
}

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

class Model {
  constructor(weights) {
    this.weights = weights;
  }

  predict(state) {
    let x = linear(state, this.weights.fc1.weight, this.weights.fc1.bias);
    x = x.map(relu);
    x = linear(x, this.weights.fc2.weight, this.weights.fc2.bias);
    x = x.map(relu);
    x = linear(x, this.weights.fc3.weight, this.weights.fc3.bias);
    return x;
  }

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

function load(filePath) {
  const absolutePath = path.resolve(filePath);
  const data = fs.readFileSync(absolutePath, "utf8");
  const weights = JSON.parse(data);
  return new Model(weights);
}

module.exports = {
  load,
  Model,
};
