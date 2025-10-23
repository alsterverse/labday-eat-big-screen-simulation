"""
Demo script to visualize the trained DQN agent on CartPole-v1
"""

import gymnasium as gym
import torch
import numpy as np
from dqn_cartpole import DQN


def demo_trained_agent(model_path='dqn_cartpole_model.pth', num_episodes=10):
    """
    Load and demonstrate the trained agent.

    Args:
        model_path: Path to the saved model weights
        num_episodes: Number of episodes to run
    """
    # Create environment with rendering
    env = gym.make("CartPole-v1", render_mode="human")

    state_size = env.observation_space.shape[0]
    action_size = env.action_space.n

    # Load the trained model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = DQN(state_size, action_size).to(device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()

    print("=" * 60)
    print("TRAINED AGENT DEMONSTRATION")
    print("=" * 60)
    print(f"Running {num_episodes} episodes with the trained agent...")
    print()

    rewards = []

    for episode in range(num_episodes):
        state, _ = env.reset()
        total_reward = 0
        done = False
        steps = 0

        while not done:
            # Use the trained network to select action (greedy policy)
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0).to(device)
                q_values = model(state_tensor)
                action = q_values.argmax().item()

            state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            total_reward += reward
            steps += 1

        rewards.append(total_reward)
        print(f"Episode {episode + 1:2d}: {int(total_reward):3d} steps")

    env.close()

    print()
    print("=" * 60)
    print(f"Average performance: {np.mean(rewards):.2f} steps")
    print(f"Best performance: {int(np.max(rewards))} steps")
    print(f"Max possible: 500 steps")
    print("=" * 60)


if __name__ == "__main__":
    demo_trained_agent(num_episodes=10)
