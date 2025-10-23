"""
Deep Q-Network (DQN) training for competitive Blob game.

Two blob agents compete against each other, learning to collect food and
steal mass from their opponent when stronger. Both agents train simultaneously
through self-play.
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque
import matplotlib.pyplot as plt
from blob_env import BlobCompeteEnv


class DQN(nn.Module):
    """
    Deep Q-Network for competitive blob agents.

    Input: 9 features:
        - agent_x, agent_y: agent position (normalized)
        - agent_angle: agent's heading direction
        - agent_mass: current mass (normalized)
        - distance_to_other: distance to opponent blob
        - relative_angle_to_other: angle to turn toward opponent
        - other_mass: opponent's mass (normalized)
        - distance_to_food: distance to closest food
        - relative_angle_to_food: angle to turn toward food
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
    """DQN Agent for competitive blob game."""
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


def train_competitive_blobs(num_episodes=300, batch_size=64, target_update_freq=10):
    """
    Main training loop for competitive blob agents.

    Two agents learn through self-play, competing for food and mass theft.
    Both agents train simultaneously using their own experiences.
    """
    # Create environment
    env = BlobCompeteEnv()
    state_size = env.observation_space.shape[0]  # 9
    action_size = env.action_space.n  # 2

    # Create two agents
    agent1 = BlobDQNAgent(state_size, action_size)
    agent2 = BlobDQNAgent(state_size, action_size)

    # Tracking metrics
    episode_lengths = []
    blob1_wins = []
    blob2_wins = []
    blob1_rewards = []
    blob2_rewards = []
    blob1_mass_stolen = []
    blob2_mass_stolen = []

    print("Starting Competitive Blob DQN training...")
    print(f"Device: {agent1.device}")
    print(f"State size: {state_size}, Action size: {action_size}")
    print(f"Initial mass: {env.initial_mass}, Decay rate: {env.mass_decay_rate}")
    print(f"Mass steal rate: {env.mass_steal_rate}")
    print(f"Food pellets: {env.max_foods}")
    print("-" * 70)

    for episode in range(num_episodes):
        (state1, state2), _ = env.reset()
        episode_reward1 = 0
        episode_reward2 = 0
        done = False

        while not done:
            # Select actions for both agents
            action1 = agent1.select_action(state1)
            action2 = agent2.select_action(state2)

            # Step environment with both actions
            (next_state1, next_state2), (reward1, reward2), terminated, truncated, info = env.step((action1, action2))
            done = terminated or truncated

            # Store experiences for both agents
            agent1.replay_buffer.push(state1, action1, reward1, next_state1, float(done))
            agent2.replay_buffer.push(state2, action2, reward2, next_state2, float(done))

            # Train both agents
            agent1.train(batch_size)
            agent2.train(batch_size)

            state1 = next_state1
            state2 = next_state2
            episode_reward1 += reward1
            episode_reward2 += reward2

        # Update target networks periodically
        if episode % target_update_freq == 0:
            agent1.update_target_network()
            agent2.update_target_network()

        # Decay exploration for both agents
        agent1.decay_epsilon()
        agent2.decay_epsilon()

        # Track metrics
        episode_length = env.get_survival_time()
        episode_lengths.append(episode_length)
        blob1_rewards.append(episode_reward1)
        blob2_rewards.append(episode_reward2)
        blob1_mass_stolen.append(info['blob1_stolen'])
        blob2_mass_stolen.append(info['blob2_stolen'])

        # Track wins (1 = blob1 won, 2 = blob2 won, 0 = draw/timeout)
        blob1_wins.append(1 if info['winner'] == 1 else 0)
        blob2_wins.append(1 if info['winner'] == 2 else 0)

        # Print progress
        if (episode + 1) % 50 == 0:
            avg_length = np.mean(episode_lengths[-50:])
            avg_reward1 = np.mean(blob1_rewards[-50:])
            avg_reward2 = np.mean(blob2_rewards[-50:])
            blob1_win_rate = np.sum(blob1_wins[-50:]) / 50
            blob2_win_rate = np.sum(blob2_wins[-50:]) / 50
            print(f"Episode {episode + 1}/{num_episodes} | "
                  f"Avg Length: {avg_length:.1f} | "
                  f"Blob1 WR: {blob1_win_rate:.2f} | "
                  f"Blob2 WR: {blob2_win_rate:.2f} | "
                  f"Epsilon: {agent1.epsilon:.3f}")

    print("-" * 70)
    print("Training completed!")
    print(f"Final episode length (last 50): {np.mean(episode_lengths[-50:]):.1f} steps")
    print(f"Blob 1 win rate (last 50): {np.sum(blob1_wins[-50:]) / 50:.2f}")
    print(f"Blob 2 win rate (last 50): {np.sum(blob2_wins[-50:]) / 50:.2f}")

    # Plot results
    plot_training_results(episode_lengths, blob1_wins, blob2_wins,
                         blob1_rewards, blob2_rewards,
                         blob1_mass_stolen, blob2_mass_stolen)

    # Save models
    torch.save(agent1.q_network.state_dict(), 'blob_compete/blob1_model.pth')
    torch.save(agent2.q_network.state_dict(), 'blob_compete/blob2_model.pth')
    print("\nModels saved to 'blob_compete/blob1_model.pth' and 'blob_compete/blob2_model.pth'")

    return agent1, agent2


def plot_training_results(episode_lengths, blob1_wins, blob2_wins,
                          blob1_rewards, blob2_rewards,
                          blob1_mass_stolen, blob2_mass_stolen):
    """Plot competitive training progress"""
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 10))

    window = 50

    # Plot episode lengths
    ax1.plot(episode_lengths, alpha=0.6, label='Episode Length')
    if len(episode_lengths) >= window:
        moving_avg = np.convolve(episode_lengths, np.ones(window)/window, mode='valid')
        ax1.plot(range(window-1, len(episode_lengths)), moving_avg,
                'r-', linewidth=2, label=f'Moving Average ({window} episodes)')
    ax1.set_xlabel('Episode')
    ax1.set_ylabel('Steps')
    ax1.set_title('Episode Length (Survival Time)')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Plot win rates
    blob1_win_cumsum = np.cumsum(blob1_wins)
    blob2_win_cumsum = np.cumsum(blob2_wins)
    episodes = np.arange(1, len(blob1_wins) + 1)
    blob1_win_rate = blob1_win_cumsum / episodes
    blob2_win_rate = blob2_win_cumsum / episodes

    ax2.plot(blob1_win_rate, label='Blob 1 Win Rate', alpha=0.8)
    ax2.plot(blob2_win_rate, label='Blob 2 Win Rate', alpha=0.8)
    ax2.axhline(y=0.5, color='gray', linestyle='--', label='50% (balanced)')
    ax2.set_xlabel('Episode')
    ax2.set_ylabel('Cumulative Win Rate')
    ax2.set_title('Win Rates Over Time')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    # Plot rewards
    ax3.plot(blob1_rewards, alpha=0.4, label='Blob 1 Reward')
    ax3.plot(blob2_rewards, alpha=0.4, label='Blob 2 Reward')
    if len(blob1_rewards) >= window:
        moving_avg1 = np.convolve(blob1_rewards, np.ones(window)/window, mode='valid')
        moving_avg2 = np.convolve(blob2_rewards, np.ones(window)/window, mode='valid')
        ax3.plot(range(window-1, len(blob1_rewards)), moving_avg1,
                linewidth=2, label=f'Blob 1 MA ({window})')
        ax3.plot(range(window-1, len(blob2_rewards)), moving_avg2,
                linewidth=2, label=f'Blob 2 MA ({window})')
    ax3.set_xlabel('Episode')
    ax3.set_ylabel('Total Reward')
    ax3.set_title('Episode Rewards')
    ax3.legend()
    ax3.grid(True, alpha=0.3)

    # Plot mass stolen
    ax4.plot(blob1_mass_stolen, alpha=0.4, label='Blob 1 Stolen')
    ax4.plot(blob2_mass_stolen, alpha=0.4, label='Blob 2 Stolen')
    if len(blob1_mass_stolen) >= window:
        moving_avg1 = np.convolve(blob1_mass_stolen, np.ones(window)/window, mode='valid')
        moving_avg2 = np.convolve(blob2_mass_stolen, np.ones(window)/window, mode='valid')
        ax4.plot(range(window-1, len(blob1_mass_stolen)), moving_avg1,
                linewidth=2, label=f'Blob 1 MA ({window})')
        ax4.plot(range(window-1, len(blob2_mass_stolen)), moving_avg2,
                linewidth=2, label=f'Blob 2 MA ({window})')
    ax4.set_xlabel('Episode')
    ax4.set_ylabel('Mass Stolen')
    ax4.set_title('Mass Stolen per Episode')
    ax4.legend()
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('blob_compete/training_results.png')
    print("Training plots saved to 'blob_compete/training_results.png'")
    plt.close()


if __name__ == "__main__":
    # Train competitive blob agents
    agent1, agent2 = train_competitive_blobs(
        num_episodes=300,
        batch_size=64,
        target_update_freq=10
    )
