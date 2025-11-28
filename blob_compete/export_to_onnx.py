"""
Export trained PyTorch models to ONNX format for web deployment
"""
import torch
import os
from train_blob import DQN
from blob_env import BlobCompeteEnv

def export_models():
    # Create environment to get state/action sizes
    env = BlobCompeteEnv()
    state_size = env.observation_space.shape[0]
    action_size = env.action_space.n

    device = torch.device("cpu")  # Use CPU for export

    # Load trained models
    agent1_network = DQN(state_size, action_size).to(device)
    agent2_network = DQN(state_size, action_size).to(device)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    model1_path = os.path.join(script_dir, 'blob1_model.pth')
    model2_path = os.path.join(script_dir, 'blob2_model.pth')

    agent1_network.load_state_dict(torch.load(model1_path, map_location=device))
    agent2_network.load_state_dict(torch.load(model2_path, map_location=device))

    agent1_network.eval()
    agent2_network.eval()

    # Create dummy input
    dummy_input = torch.randn(1, state_size)

    # Export blob1 model
    onnx1_path = os.path.join(script_dir, 'blob1_model.onnx')
    torch.onnx.export(
        agent1_network,
        dummy_input,
        onnx1_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    print(f"Exported blob1 model to {onnx1_path}")

    # Export blob2 model
    onnx2_path = os.path.join(script_dir, 'blob2_model.onnx')
    torch.onnx.export(
        agent2_network,
        dummy_input,
        onnx2_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    print(f"Exported blob2 model to {onnx2_path}")

    print("\nExport successful!")
    print(f"State size: {state_size}, Action size: {action_size}")

if __name__ == "__main__":
    export_models()
