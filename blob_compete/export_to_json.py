"""
Export trained PyTorch model weights to JSON for web deployment
"""
import torch
import json
import os
from train_blob import DQN
from blob_env import BlobCompeteEnv

def export_model_to_json(model, output_path):
    """Export model weights to JSON format"""
    state_dict = model.state_dict()

    # Convert tensors to lists
    weights_dict = {}
    for key, tensor in state_dict.items():
        weights_dict[key] = tensor.cpu().numpy().tolist()

    # Save to JSON
    with open(output_path, 'w') as f:
        json.dump(weights_dict, f)

    print(f"Exported model weights to {output_path}")

def export_models():
    # Create environment to get state/action sizes
    env = BlobCompeteEnv()
    state_size = env.observation_space.shape[0]
    action_size = env.action_space.n

    device = torch.device("cpu")

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

    # Export models to JSON
    json1_path = os.path.join(script_dir, 'blob1_model.json')
    json2_path = os.path.join(script_dir, 'blob2_model.json')

    export_model_to_json(agent1_network, json1_path)
    export_model_to_json(agent2_network, json2_path)

    # Export environment config
    config = {
        'state_size': int(state_size),
        'action_size': int(action_size),
        'map_size': float(env.map_size),
        'agent_radius': float(env.agent_radius),
        'initial_mass': float(env.initial_mass),
        'min_mass': float(env.min_mass),
        'mass_decay_rate': float(env.mass_decay_rate),
        'mass_steal_rate': float(env.mass_steal_rate),
        'food_mass_gain': float(env.food_mass_gain),
        'movement_speed': float(env.movement_speed),
        'turn_rate': float(env.turn_rate),
        'max_foods': int(env.max_foods)
    }

    config_path = os.path.join(script_dir, 'env_config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"Exported environment config to {config_path}")
    print("\nExport successful!")
    print(f"State size: {state_size}, Action size: {action_size}")

if __name__ == "__main__":
    export_models()
