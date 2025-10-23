"""
Deep Q-Network (DQN) training for the Blob Harvest game.

The blob agent learns to collect food pellets to survive. Episode length naturally
increases from ~25 steps (untrained, dies from starvation) to 500+ steps (trained,
efficiently finds and collects food).
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque
import matplotlib.pyplot as plt
from blob_env import BlobEnv


class DQN(nn.Module):
    """
    Deep Q-Network for the blob agent.

    Input: 6 features:
        - agent_x, agent_y: agent position (normalized)
        - agent_angle: agent's heading direction
        - relative_angle_to_food: angle difference to turn toward food (-pi to pi)
        - distance_to_food: normalized distance to closest food
        - agent_mass: current mass (normalized)
    Output: Q-values for 2 actions (steer left, steer right)
    """
    def __init__(self, state_size, action_size, hidden_size=128):
        super(DQN, self).__init__()
        self.fc1 = nn.Linear(state_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.fc3 = nn.Linear(hidden_size, action_size)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return self.fc3(x)


class ReplayBuffer:
    """Experience Replay Buffer for storing and sampling past experiences."""
    def __init__(self, capacity=50000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        """Add experience to buffer"""
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        """Sample random batch of experiences"""
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            np.array(states),
            np.array(actions),
            np.array(rewards),
            np.array(next_states),
            np.array(dones)
        )

    def __len__(self):
        return len(self.buffer)


class BlobDQNAgent:
    """DQN Agent for the Blob Harvest game."""
    def __init__(self, state_size, action_size, learning_rate=0.001, gamma=0.99,
                 epsilon_start=1.0, epsilon_end=0.01, epsilon_decay=0.995):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma

        # Epsilon-greedy exploration
        self.epsilon = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay

        # Neural networks
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.q_network = DQN(state_size, action_size).to(self.device)
        self.target_network = DQN(state_size, action_size).to(self.device)
        self.target_network.load_state_dict(self.q_network.state_dict())
        self.target_network.eval()

        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)
        self.replay_buffer = ReplayBuffer()

    def select_action(self, state):
        """Epsilon-greedy action selection"""
        if random.random() < self.epsilon:
            return random.randrange(self.action_size)

        with torch.no_grad():
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
            q_values = self.q_network(state_tensor)
            return q_values.argmax().item()

    def train(self, batch_size=64):
        """Train on a batch from replay buffer"""
        if len(self.replay_buffer) < batch_size:
            return None

        # Sample batch
        states, actions, rewards, next_states, dones = self.replay_buffer.sample(batch_size)

        # Convert to tensors
        states = torch.FloatTensor(states).to(self.device)
        actions = torch.LongTensor(actions).to(self.device)
        rewards = torch.FloatTensor(rewards).to(self.device)
        next_states = torch.FloatTensor(next_states).to(self.device)
        dones = torch.FloatTensor(dones).to(self.device)

        # Compute Q-values
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))

        # Compute target Q-values
        with torch.no_grad():
            next_q_values = self.target_network(next_states).max(1)[0]
            target_q_values = rewards + (1 - dones) * self.gamma * next_q_values

        # Compute loss and update
        loss = nn.MSELoss()(current_q_values.squeeze(), target_q_values)

        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        return loss.item()

    def update_target_network(self):
        """Copy weights from Q-network to target network"""
        self.target_network.load_state_dict(self.q_network.state_dict())

    def decay_epsilon(self):
        """Decrease exploration rate"""
        self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)


def train_blob_agent(num_episodes=800, batch_size=64, target_update_freq=10):
    """
    Main training loop for blob agent.

    Episode length naturally increases as agent gets better:
    - Early episodes: ~25 steps (agent starves quickly)
    - Later episodes: 500+ steps (agent efficiently collects food)
    """
    # Create environment
    env = BlobEnv()
    state_size = env.observation_space.shape[0]  # 6
    action_size = env.action_space.n  # 2

    # Create agent
    agent = BlobDQNAgent(state_size, action_size)

    # Tracking metrics
    episode_lengths = []
    episode_rewards = []
    episode_losses = []
    episode_foods_collected = []

    print("Starting Blob Harvest DQN training...")
    print(f"Device: {agent.device}")
    print(f"State size: {state_size}, Action size: {action_size}")
    print(f"Initial mass: {env.initial_mass}, Decay rate: {env.mass_decay_rate}")
    print(f"Agent radius: {env.agent_radius} (constant)")
    print(f"Expected survival without food: ~{int((env.initial_mass - env.min_mass) / env.mass_decay_rate)} steps")
    print("-" * 70)

    for episode in range(num_episodes):
        state, _ = env.reset()
        episode_reward = 0
        episode_loss_sum = 0
        loss_count = 0
        done = False

        while not done:
            # Select and perform action
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            # Store experience
            agent.replay_buffer.push(state, action, reward, next_state, float(done))

            # Train
            loss = agent.train(batch_size)
            if loss is not None:
                episode_loss_sum += loss
                loss_count += 1

            state = next_state
            episode_reward += reward

        # Update target network periodically
        if episode % target_update_freq == 0:
            agent.update_target_network()

        # Decay exploration
        agent.decay_epsilon()

        # Track metrics
        episode_length = env.get_survival_time()
        episode_lengths.append(episode_length)
        episode_rewards.append(episode_reward)
        episode_foods_collected.append(env.foods_collected)
        avg_loss = episode_loss_sum / loss_count if loss_count > 0 else 0
        episode_losses.append(avg_loss)

        # Print progress
        if (episode + 1) % 50 == 0:
            avg_length = np.mean(episode_lengths[-50:])
            avg_reward = np.mean(episode_rewards[-50:])
            avg_foods = np.mean(episode_foods_collected[-50:])
            print(f"Episode {episode + 1}/{num_episodes} | "
                  f"Avg Length: {avg_length:.1f} | "
                  f"Avg Reward: {avg_reward:.2f} | "
                  f"Avg Foods: {avg_foods:.1f} | "
                  f"Epsilon: {agent.epsilon:.3f}")

    print("-" * 70)
    print("Training completed!")
    print(f"Final average episode length (last 50): {np.mean(episode_lengths[-50:]):.1f} steps")
    print(f"Final average foods collected (last 50): {np.mean(episode_foods_collected[-50:]):.1f}")

    # Plot results
    plot_training_results(episode_lengths, episode_rewards, episode_foods_collected, episode_losses)

    # Save model
    torch.save(agent.q_network.state_dict(), 'blob_harvest/blob_model.pth')
    print("\nModel saved to 'blob_harvest/blob_model.pth'")

    return agent, episode_lengths, episode_rewards


def plot_training_results(episode_lengths, episode_rewards, episode_foods, episode_losses):
    """Plot training progress"""
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 10))

    # Plot episode lengths (survival time)
    ax1.plot(episode_lengths, alpha=0.6, label='Episode Length')
    window = 50
    if len(episode_lengths) >= window:
        moving_avg = np.convolve(episode_lengths, np.ones(window)/window, mode='valid')
        ax1.plot(range(window-1, len(episode_lengths)), moving_avg,
                'r-', linewidth=2, label=f'Moving Average ({window} episodes)')
    ax1.axhline(y=56, color='orange', linestyle='--', label='~Initial survival (~56 steps)')
    ax1.axhline(y=500, color='g', linestyle='--', label='Target survival (500 steps)')
    ax1.set_xlabel('Episode')
    ax1.set_ylabel('Steps Survived')
    ax1.set_title('Episode Length (Survival Time)')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Plot rewards
    ax2.plot(episode_rewards, alpha=0.6, label='Episode Reward')
    if len(episode_rewards) >= window:
        moving_avg = np.convolve(episode_rewards, np.ones(window)/window, mode='valid')
        ax2.plot(range(window-1, len(episode_rewards)), moving_avg,
                'r-', linewidth=2, label=f'Moving Average ({window} episodes)')
    ax2.set_xlabel('Episode')
    ax2.set_ylabel('Total Reward')
    ax2.set_title('Episode Rewards')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    # Plot foods collected
    ax3.plot(episode_foods, alpha=0.6, label='Foods Collected')
    if len(episode_foods) >= window:
        moving_avg = np.convolve(episode_foods, np.ones(window)/window, mode='valid')
        ax3.plot(range(window-1, len(episode_foods)), moving_avg,
                'r-', linewidth=2, label=f'Moving Average ({window} episodes)')
    ax3.set_xlabel('Episode')
    ax3.set_ylabel('Foods Collected')
    ax3.set_title('Foods Collected per Episode')
    ax3.legend()
    ax3.grid(True, alpha=0.3)

    # Plot losses
    ax4.plot(episode_losses, alpha=0.6)
    ax4.set_xlabel('Episode')
    ax4.set_ylabel('Average Loss')
    ax4.set_title('Training Loss')
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('blob_harvest/training_results.png')
    print("Training plots saved to 'blob_harvest/training_results.png'")
    plt.close()


if __name__ == "__main__":
    # Train the blob agent
    agent, lengths, rewards = train_blob_agent(
        num_episodes=800,
        batch_size=64,
        target_update_freq=10
    )
