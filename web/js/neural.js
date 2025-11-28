/**
 * Neural network inference in pure JavaScript.
 * Implements a simple feedforward network with ReLU activations.
 */

export class NeuralNetwork {
    constructor() {
        this.w1 = null;
        this.b1 = null;
        this.w2 = null;
        this.b2 = null;
        this.w3 = null;
        this.b3 = null;
        this.loaded = false;
    }

    async loadWeights(url) {
        const response = await fetch(url);
        const data = await response.json();
        this.w1 = data.w1;
        this.b1 = data.b1;
        this.w2 = data.w2;
        this.b2 = data.b2;
        this.w3 = data.w3;
        this.b3 = data.b3;
        this.loaded = true;
    }

    /**
     * Matrix-vector multiplication: result = input @ matrix + bias
     */
    linear(input, weights, bias) {
        const outputSize = weights[0].length;
        const result = new Array(outputSize).fill(0);

        for (let j = 0; j < outputSize; j++) {
            let sum = bias[j];
            for (let i = 0; i < input.length; i++) {
                sum += input[i] * weights[i][j];
            }
            result[j] = sum;
        }
        return result;
    }

    /**
     * ReLU activation function
     */
    relu(arr) {
        return arr.map(x => Math.max(0, x));
    }

    /**
     * Forward pass through the network
     */
    forward(state) {
        let x = this.linear(state, this.w1, this.b1);
        x = this.relu(x);
        x = this.linear(x, this.w2, this.b2);
        x = this.relu(x);
        x = this.linear(x, this.w3, this.b3);
        return x;
    }

    /**
     * Select action with highest Q-value
     */
    selectAction(state) {
        const qValues = this.forward(state);
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
