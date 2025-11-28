// Simple DQN implementation in JavaScript
class DQN {
    constructor() {
        this.fc1_weight = null;
        this.fc1_bias = null;
        this.fc2_weight = null;
        this.fc2_bias = null;
        this.fc3_weight = null;
        this.fc3_bias = null;
    }

    async loadWeights(jsonPath) {
        const response = await fetch(jsonPath);
        const weights = await response.json();

        // Load weights and biases
        this.fc1_weight = weights['fc1.weight'];
        this.fc1_bias = weights['fc1.bias'];
        this.fc2_weight = weights['fc2.weight'];
        this.fc2_bias = weights['fc2.bias'];
        this.fc3_weight = weights['fc3.weight'];
        this.fc3_bias = weights['fc3.bias'];
    }

    relu(x) {
        return x.map(val => Math.max(0, val));
    }

    matmul(weights, input) {
        // weights is [out_features, in_features]
        // input is [in_features]
        // result is [out_features]
        const result = [];
        for (let i = 0; i < weights.length; i++) {
            let sum = 0;
            for (let j = 0; j < input.length; j++) {
                sum += weights[i][j] * input[j];
            }
            result.push(sum);
        }
        return result;
    }

    add(a, b) {
        return a.map((val, i) => val + b[i]);
    }

    forward(state) {
        // Layer 1: fc1 + ReLU
        let x = this.matmul(this.fc1_weight, state);
        x = this.add(x, this.fc1_bias);
        x = this.relu(x);

        // Layer 2: fc2 + ReLU
        x = this.matmul(this.fc2_weight, x);
        x = this.add(x, this.fc2_bias);
        x = this.relu(x);

        // Layer 3: fc3 (output layer)
        x = this.matmul(this.fc3_weight, x);
        x = this.add(x, this.fc3_bias);

        return x;
    }

    selectAction(state) {
        const qValues = this.forward(state);
        // Argmax
        let maxIndex = 0;
        let maxValue = qValues[0];
        for (let i = 1; i < qValues.length; i++) {
            if (qValues[i] > maxValue) {
                maxValue = qValues[i];
                maxIndex = i;
            }
        }
        return maxIndex;
    }
}
