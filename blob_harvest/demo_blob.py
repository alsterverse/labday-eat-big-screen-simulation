"""
Interactive visualization demo for the trained Blob Harvest agent.

Watch the blob agent navigate and collect food pellets using the trained DQN model.
"""

import torch
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.animation import FuncAnimation
from blob_env import BlobEnv
from train_blob import DQN


class BlobVisualizer:
    """Visualizes the blob agent in real-time using matplotlib."""

    def __init__(self, env, agent, interval=50):
        self.env = env
        self.agent = agent
        self.interval = interval

        # Setup figure and axis
        self.fig, self.ax = plt.subplots(figsize=(10, 10))
        self.ax.set_xlim(0, env.map_size)
        self.ax.set_ylim(0, env.map_size)
        self.ax.set_aspect('equal')
        self.ax.set_facecolor('#1a1a1a')
        self.fig.patch.set_facecolor('#2d2d2d')

        # Agent visualization
        self.agent_circle = plt.Circle((0, 0), 1, color='#00ff88', alpha=0.8)
        self.agent_direction = plt.Arrow(0, 0, 0, 0, width=2, color='#ffffff', alpha=0.9)
        self.ax.add_patch(self.agent_circle)
        self.ax.add_patch(self.agent_direction)

        # Food pellets
        self.food_circles = []

        # Info text
        self.info_text = self.ax.text(
            0.02, 0.98, '', transform=self.ax.transAxes,
            fontsize=12, verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='black', alpha=0.7),
            color='white', family='monospace'
        )

        # Episode state
        self.state = None
        self.done = False
        self.steps = 0
        self.total_reward = 0
        self.foods_collected = 0

    def reset_episode(self):
        """Reset the environment for a new episode"""
        self.state, _ = self.env.reset()
        self.done = False
        self.steps = 0
        self.total_reward = 0
        self.foods_collected = 0

    def update(self, frame):
        """Update function for animation"""
        if self.done:
            self.reset_episode()

        # Agent selects action (greedy, no exploration)
        with torch.no_grad():
            state_tensor = torch.FloatTensor(self.state).unsqueeze(0).to(self.agent.device)
            action = self.agent.q_network(state_tensor).argmax().item()

        # Execute action
        prev_foods = self.env.foods_collected
        self.state, reward, terminated, truncated, _ = self.env.step(action)
        self.done = terminated or truncated

        # Track metrics
        self.steps += 1
        self.total_reward += reward
        if self.env.foods_collected > prev_foods:
            self.foods_collected += 1

        # Update agent visualization
        agent_x = self.env.agent_pos[0]
        agent_y = self.env.agent_pos[1]
        agent_radius = self.env.agent_radius  # Use constant radius
        agent_angle = self.env.agent_angle

        self.agent_circle.set_center((agent_x, agent_y))
        self.agent_circle.set_radius(agent_radius)

        # Update direction arrow
        arrow_length = agent_radius * 1.5
        arrow_dx = arrow_length * np.cos(agent_angle)
        arrow_dy = arrow_length * np.sin(agent_angle)

        # Remove old arrow and create new one
        self.agent_direction.remove()
        self.agent_direction = plt.Arrow(
            agent_x, agent_y, arrow_dx, arrow_dy,
            width=agent_radius * 0.8, color='#ffffff', alpha=0.9
        )
        self.ax.add_patch(self.agent_direction)

        # Update food pellets
        for circle in self.food_circles:
            circle.remove()
        self.food_circles.clear()

        for food_pos in self.env.foods:
            food_circle = plt.Circle(food_pos, 1.0, color='#ff4444', alpha=0.9)
            self.ax.add_patch(food_circle)
            self.food_circles.append(food_circle)

        # Update info text
        action_str = "LEFT" if action == 0 else "RIGHT"
        info = (f"Steps: {self.steps:4d}\n"
                f"Mass: {self.env.agent_mass:5.2f}\n"
                f"Foods: {self.foods_collected:3d}\n"
                f"Reward: {self.total_reward:6.1f}\n"
                f"Action: {action_str}")
        self.info_text.set_text(info)

        # Change agent color based on mass (for visual feedback)
        mass_ratio = (self.env.agent_mass - self.env.min_mass) / (self.env.initial_mass - self.env.min_mass)
        if mass_ratio < 0.3:
            self.agent_circle.set_color('#ff8800')  # Orange when low mass (danger!)
        elif mass_ratio > 1.5:
            self.agent_circle.set_color('#00ffff')  # Cyan when high mass
        else:
            self.agent_circle.set_color('#00ff88')  # Green normal

        return [self.agent_circle, self.agent_direction, self.info_text] + self.food_circles

    def run(self):
        """Start the visualization"""
        self.reset_episode()
        self.anim = FuncAnimation(
            self.fig, self.update,
            interval=self.interval,
            blit=True,
            cache_frame_data=False
        )
        plt.title("Blob Harvest - Trained Agent", fontsize=16, color='white', pad=20)
        plt.show()


def demo_trained_agent(model_path='blob_harvest/blob_model.pth'):
    """
    Demonstrate the trained blob agent with real-time visualization.
    """
    # Create environment
    env = BlobEnv()
    state_size = env.observation_space.shape[0]
    action_size = env.action_space.n

    # Load trained model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    q_network = DQN(state_size, action_size).to(device)

    try:
        q_network.load_state_dict(torch.load(model_path, map_location=device))
        q_network.eval()
        print(f"Loaded trained model from {model_path}")
    except FileNotFoundError:
        print(f"Model file not found: {model_path}")
        print("Please train the agent first by running: python blob_harvest/train_blob.py")
        return

    # Create agent wrapper
    class AgentWrapper:
        def __init__(self, q_network, device):
            self.q_network = q_network
            self.device = device

    agent = AgentWrapper(q_network, device)

    # Create and run visualizer
    print("Starting visualization...")
    print("The blob has constant size but changes color based on mass:")
    print("  - Green: Normal mass")
    print("  - Orange: Low mass (danger!)")
    print("  - Cyan: High mass (lots of food collected)")
    print("\nClose the window to exit.")

    visualizer = BlobVisualizer(env, agent, interval=50)
    visualizer.run()


if __name__ == "__main__":
    demo_trained_agent()
