"""
Web-compatible AI using pure numpy for neural network inference.

This module provides a numpy-based implementation of the trained DQN,
enabling the AI to run in Pygbag/Pyodide where PyTorch is not available.
"""

import numpy as np


class NumpyDQN:
    """
    Pure numpy implementation of the trained DQN for web compatibility.

    Performs the same forward pass as the PyTorch model but using only numpy operations.
    """

    def __init__(self, weights_path: str):
        """
        Load model weights from a numpy .npz file.

        Args:
            weights_path: Path to the .npz file containing model weights
        """
        data = np.load(weights_path)
        self.w1 = data['w1']
        self.b1 = data['b1']
        self.w2 = data['w2']
        self.b2 = data['b2']
        self.w3 = data['w3']
        self.b3 = data['b3']

    def forward(self, x: np.ndarray) -> np.ndarray:
        """
        Perform forward pass through the network.

        Args:
            x: Input state array

        Returns:
            Q-values for each action
        """
        x = np.maximum(0, x @ self.w1 + self.b1)  # ReLU
        x = np.maximum(0, x @ self.w2 + self.b2)  # ReLU
        return x @ self.w3 + self.b3

    def select_action(self, state) -> int:
        """
        Select the best action given a state (greedy policy).

        Args:
            state: Current observation state

        Returns:
            Action index (0 or 1)
        """
        q_values = self.forward(np.array(state, dtype=np.float32))
        return int(np.argmax(q_values))
