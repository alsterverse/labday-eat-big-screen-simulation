"""
Export numpy weight files to JSON format for JavaScript consumption.
"""

import numpy as np
import json


def export_weights_to_json(npz_path: str, json_path: str):
    """Convert .npz weights to .json format."""
    data = np.load(npz_path)
    weights = {k: data[k].tolist() for k in data.files}
    with open(json_path, 'w') as f:
        json.dump(weights, f)
    print(f"Exported {npz_path} -> {json_path}")


if __name__ == "__main__":
    export_weights_to_json('blob_compete/blob1_weights.npz', 'web/models/blob1_weights.json')
    export_weights_to_json('blob_compete/blob2_weights.npz', 'web/models/blob2_weights.json')
    print("All weights exported to JSON!")
