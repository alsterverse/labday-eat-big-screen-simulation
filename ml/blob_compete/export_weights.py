"""
Export PyTorch model weights to numpy format for web compatibility.

This script converts the trained DQN models from PyTorch .pth format to numpy .npz format,
enabling the use of trained models in Pygbag/Pyodide where PyTorch is not available.
"""

import torch
import numpy as np
from train_blob import DQN


def export_model(model_path: str, output_path: str, state_size: int = 8, action_size: int = 2):
    """
    Export a PyTorch DQN model to numpy format.

    Args:
        model_path: Path to the PyTorch .pth model file
        output_path: Path for the output .npz file
        state_size: Input state size (default: 8)
        action_size: Number of actions (default: 2)
    """
    model = DQN(state_size, action_size)
    model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=True))

    np.savez(
        output_path,
        w1=model.fc1.weight.detach().numpy().T,
        b1=model.fc1.bias.detach().numpy(),
        w2=model.fc2.weight.detach().numpy().T,
        b2=model.fc2.bias.detach().numpy(),
        w3=model.fc3.weight.detach().numpy().T,
        b3=model.fc3.bias.detach().numpy()
    )
    print(f"Exported {model_path} -> {output_path}")


if __name__ == "__main__":
    export_model('blob1_model.pth', 'blob1_weights.npz')
    export_model('blob2_model.pth', 'blob2_weights.npz')
    print("All models exported successfully!")
