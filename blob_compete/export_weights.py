#!/usr/bin/env python3
"""
Export PyTorch DQN model weights to JSON for use in JavaScript.
"""

import json
import torch
import os

def export_model_weights(pth_path, json_path):
    """
    Load a PyTorch state dict and export weights to JSON.

    Args:
        pth_path: Path to the .pth file
        json_path: Output path for the JSON file
    """
    # Load the state dict
    state_dict = torch.load(pth_path, map_location='cpu', weights_only=True)

    # Extract weights and biases, converting to nested Python lists
    weights = {
        'fc1': {
            'weight': state_dict['fc1.weight'].tolist(),
            'bias': state_dict['fc1.bias'].tolist()
        },
        'fc2': {
            'weight': state_dict['fc2.weight'].tolist(),
            'bias': state_dict['fc2.bias'].tolist()
        },
        'fc3': {
            'weight': state_dict['fc3.weight'].tolist(),
            'bias': state_dict['fc3.bias'].tolist()
        }
    }

    # Print layer shapes for verification
    print(f"Exporting {pth_path}:")
    print(f"  fc1: weight {state_dict['fc1.weight'].shape}, bias {state_dict['fc1.bias'].shape}")
    print(f"  fc2: weight {state_dict['fc2.weight'].shape}, bias {state_dict['fc2.bias'].shape}")
    print(f"  fc3: weight {state_dict['fc3.weight'].shape}, bias {state_dict['fc3.bias'].shape}")

    # Save to JSON
    with open(json_path, 'w') as f:
        json.dump(weights, f)

    print(f"  Saved to {json_path}")
    return weights


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Export both models
    export_model_weights(
        os.path.join(script_dir, 'blob1_model.pth'),
        os.path.join(script_dir, 'blob1_weights.json')
    )

    export_model_weights(
        os.path.join(script_dir, 'blob2_model.pth'),
        os.path.join(script_dir, 'blob2_weights.json')
    )

    print("\nDone! You can now use the JSON files with dqn_inference.js")
