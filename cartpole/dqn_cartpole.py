"""
Deep Q-Network (DQN) implementation for CartPole-v1

This script implements a DQN agent from scratch to solve the CartPole balancing task.
The agent learns through experience replay and uses a target network for stable training.
"""

import gymnasium as gym
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque
import matplotlib.pyplot as plt


class DQN(nn.Module):
    """
    Deep Q-Network: Neural network that approximates the Q-value function.

    Architecture:
    - Input: State (4 values: cart position, cart velocity, pole angle, pole angular velocity)
    - Hidden: Two fully connected layers with ReLU activation
    - Output: Q-values for each action (2 actions: left, right)
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
    """
    Experience Replay Buffer: Stores past experiences for training.

    This breaks correlation between consecutive samples and improves learning stability.
    Stores tuples of (state, action, reward, next_state, done).
    """
    def __init__(self, capacity=10000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        """Add an experience to the buffer"""
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        """Randomly sample a batch of experiences"""
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


class DQNAgent:
    """
    DQN Agent: Implements the Deep Q-Learning algorithm.

    Key features:
    - Epsilon-greedy exploration (starts random, becomes more greedy over time)
    - Experience replay (learns from past experiences)
    - Target network (separate network for stable Q-value targets)
    """
    def __init__(self, state_size, action_size, learning_rate=0.001, gamma=0.99,
                 epsilon_start=1.0, epsilon_end=0.01, epsilon_decay=0.995):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma  # Discount factor for future rewards

        # Epsilon-greedy parameters
        self.epsilon = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay

        # Q-Network and Target Network
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.q_network = DQN(state_size, action_size).to(self.device)
        self.target_network = DQN(state_size, action_size).to(self.device)
        self.target_network.load_state_dict(self.q_network.state_dict())
        self.target_network.eval()  # Target network is not trained directly

        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)
        self.replay_buffer = ReplayBuffer()

    def select_action(self, state):
        """
        Select action using epsilon-greedy policy:
        - With probability epsilon: random action (exploration)
        - With probability 1-epsilon: best action from Q-network (exploitation)
        """
        if random.random() < self.epsilon:
            return random.randrange(self.action_size)

        with torch.no_grad():
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
            q_values = self.q_network(state_tensor)
            return q_values.argmax().item()

    def train(self, batch_size=64):
        """
        Train the Q-network using experience replay.

        Uses the Bellman equation: Q(s,a) = r + gamma * max_a' Q(s',a')
        """
        if len(self.replay_buffer) < batch_size:
            return None

        # Sample batch from replay buffer
        states, actions, rewards, next_states, dones = self.replay_buffer.sample(batch_size)

        # Convert to tensors
        states = torch.FloatTensor(states).to(self.device)
        actions = torch.LongTensor(actions).to(self.device)
        rewards = torch.FloatTensor(rewards).to(self.device)
        next_states = torch.FloatTensor(next_states).to(self.device)
        dones = torch.FloatTensor(dones).to(self.device)

        # Current Q-values: Q(s,a)
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))

        # Target Q-values: r + gamma * max_a' Q_target(s',a')
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
        """Decrease epsilon over time (explore less, exploit more)"""
        self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)


def train_dqn(num_episodes=600, batch_size=64, target_update_freq=10, render_final=True):
    """
    Main training loop for DQN agent on CartPole-v1.

    Args:
        num_episodes: Number of episodes to train
        batch_size: Batch size for training
        target_update_freq: How often to update target network (in episodes)
        render_final: Whether to render the final trained agent
    """
    # Create environment
    env = gym.make("CartPole-v1")
    state_size = env.observation_space.shape[0]  # 4
    action_size = env.action_space.n  # 2

    # Create agent
    agent = DQNAgent(state_size, action_size)

    # Tracking metrics
    episode_rewards = []
    episode_losses = []

    print("Starting DQN training on CartPole-v1...")
    print(f"Device: {agent.device}")
    print(f"State size: {state_size}, Action size: {action_size}")
    print("-" * 60)

    for episode in range(num_episodes):
        state, _ = env.reset()
        episode_reward = 0
        episode_loss_sum = 0
        episode_steps = 0
        done = False

        while not done:
            # Select and perform action
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            # Store experience in replay buffer
            agent.replay_buffer.push(state, action, reward, next_state, float(done))

            # Train the agent
            loss = agent.train(batch_size)
            if loss is not None:
                episode_loss_sum += loss
                episode_steps += 1

            state = next_state
            episode_reward += reward

        # Update target network periodically
        if episode % target_update_freq == 0:
            agent.update_target_network()

        # Decay exploration rate
        agent.decay_epsilon()

        # Track metrics
        episode_rewards.append(episode_reward)
        avg_loss = episode_loss_sum / episode_steps if episode_steps > 0 else 0
        episode_losses.append(avg_loss)

        # Print progress
        if (episode + 1) % 50 == 0:
            avg_reward = np.mean(episode_rewards[-50:])
            print(f"Episode {episode + 1}/{num_episodes} | "
                  f"Avg Reward (last 50): {avg_reward:.2f} | "
                  f"Epsilon: {agent.epsilon:.3f}")

    env.close()
    print("-" * 60)
    print("Training completed!")

    # Plot training results
    plot_training_results(episode_rewards, episode_losses)

    # Demonstrate the trained agent
    if render_final:
        print("\nDemonstrating trained agent...")
        demonstrate_agent(agent)

    return agent, episode_rewards


def plot_training_results(episode_rewards, episode_losses):
    """Plot the training progress"""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8))

    # Plot rewards
    ax1.plot(episode_rewards, alpha=0.6, label='Episode Reward')
    # Plot moving average
    window = 50
    if len(episode_rewards) >= window:
        moving_avg = np.convolve(episode_rewards, np.ones(window)/window, mode='valid')
        ax1.plot(range(window-1, len(episode_rewards)), moving_avg,
                 'r-', linewidth=2, label=f'Moving Average ({window} episodes)')
    ax1.axhline(y=500, color='g', linestyle='--', label='Max Score (500)')
    ax1.set_xlabel('Episode')
    ax1.set_ylabel('Reward')
    ax1.set_title('Training Progress: Episode Rewards')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Plot losses
    ax2.plot(episode_losses, alpha=0.6)
    ax2.set_xlabel('Episode')
    ax2.set_ylabel('Average Loss')
    ax2.set_title('Training Progress: Loss')
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('dqn_training_results.png')
    print("Training plots saved to 'dqn_training_results.png'")
    plt.close()


def demonstrate_agent(agent, num_episodes=5):
    """
    Demonstrate the trained agent with rendering.
    """
    env = gym.make("CartPole-v1", render_mode="human")

    for episode in range(num_episodes):
        state, _ = env.reset()
        total_reward = 0
        done = False

        while not done:
            # Use greedy policy (no exploration)
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0).to(agent.device)
                action = agent.q_network(state_tensor).argmax().item()

            state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            total_reward += reward

        print(f"Demo Episode {episode + 1}: Reward = {total_reward}")

    env.close()


if __name__ == "__main__":
    # Train the DQN agent
    agent, rewards = train_dqn(
        num_episodes=600,
        batch_size=64,
        target_update_freq=10,
        render_final=True
    )

    # Save the trained model
    torch.save(agent.q_network.state_dict(), 'dqn_cartpole_model.pth')
    print("\nModel saved to 'dqn_cartpole_model.pth'")
