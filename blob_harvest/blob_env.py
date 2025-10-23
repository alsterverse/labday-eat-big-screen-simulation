"""
Custom Gymnasium environment for the blob food harvesting game.

A blob agent with mass navigates a 2D map collecting food pellets.
- Agent can steer left or right, always moving forward
- Agent has constant radius (independent of mass)
- Mass increases when food is collected
- Mass decays each step, causing episode termination if mass reaches zero
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
import math


class BlobEnv(gym.Env):
    """
    Blob Harvesting Environment

    State:
        - agent_x: Agent x position (normalized)
        - agent_y: Agent y position (normalized)
        - agent_angle: Agent's current angle in radians
        - closest_food_x: Closest food x position (normalized)
        - closest_food_y: Closest food y position (normalized)
        - agent_mass: Current mass of the agent (normalized)

    Actions:
        0: Steer left
        1: Steer right

    Rewards:
        +10 for collecting food
        +0.01 base reward for surviving each step
        +/- small reward for moving toward/away from food (reward shaping)
        Episode ends when mass reaches minimum threshold
    """

    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 30}

    def __init__(self, render_mode=None, map_size=100.0, initial_mass=5.0,
                 mass_decay_rate=0.08, movement_speed=1.2, turn_rate=0.12,
                 food_mass_gain=2.0, min_mass=0.5, max_foods=8, agent_radius=2.5):
        super().__init__()

        # Environment parameters
        self.map_size = map_size
        self.initial_mass = initial_mass
        self.mass_decay_rate = mass_decay_rate
        self.movement_speed = movement_speed
        self.turn_rate = turn_rate
        self.food_mass_gain = food_mass_gain
        self.min_mass = min_mass
        self.max_foods = max_foods
        self.agent_radius = agent_radius  # Constant radius, independent of mass

        # State: [agent_x, agent_y, agent_angle, relative_angle_to_food, distance_to_food, agent_mass]
        # relative_angle_to_food: angle difference between agent heading and food direction
        # distance_to_food: normalized distance to closest food
        self.observation_space = spaces.Box(
            low=np.array([0.0, 0.0, -np.pi, -np.pi, 0.0, 0.0]),
            high=np.array([1.0, 1.0, np.pi, np.pi, 1.0, 10.0]),
            dtype=np.float32
        )

        # Actions: 0 = steer left, 1 = steer right
        self.action_space = spaces.Discrete(2)

        # Agent state
        self.agent_pos = np.array([0.0, 0.0])
        self.agent_angle = 0.0
        self.agent_mass = initial_mass

        # Food pellets
        self.foods = []

        # Episode tracking
        self.steps = 0
        self.max_steps = 1000  # High limit, natural death will occur from starvation
        self.foods_collected = 0

        # For reward shaping
        self.prev_distance_to_food = None

        self.render_mode = render_mode

    def reset(self, seed=None, options=None):
        """Reset the environment to initial state"""
        super().reset(seed=seed)

        # Reset agent to center of map, random angle
        self.agent_pos = np.array([self.map_size / 2, self.map_size / 2])
        self.agent_angle = self.np_random.uniform(-np.pi, np.pi)
        self.agent_mass = self.initial_mass

        # Spawn food pellets
        self.foods = []
        for _ in range(self.max_foods):
            food_pos = self.np_random.uniform(5, self.map_size - 5, size=2)
            self.foods.append(food_pos)

        self.steps = 0
        self.foods_collected = 0

        # Initialize distance tracking for reward shaping
        if len(self.foods) > 0:
            distances = [np.linalg.norm(self.agent_pos - food) for food in self.foods]
            self.prev_distance_to_food = min(distances)
        else:
            self.prev_distance_to_food = 0.0

        return self._get_observation(), {}

    def step(self, action):
        """Execute one step in the environment"""
        self.steps += 1

        # Apply steering (0 = left, 1 = right)
        if action == 0:
            self.agent_angle += self.turn_rate
        else:
            self.agent_angle -= self.turn_rate

        # Normalize angle to [-pi, pi]
        self.agent_angle = np.arctan2(np.sin(self.agent_angle), np.cos(self.agent_angle))

        # Move forward based on current angle
        self.agent_pos[0] += self.movement_speed * np.cos(self.agent_angle)
        self.agent_pos[1] += self.movement_speed * np.sin(self.agent_angle)

        # Keep agent within bounds (wrap around)
        self.agent_pos[0] = self.agent_pos[0] % self.map_size
        self.agent_pos[1] = self.agent_pos[1] % self.map_size

        # Decay mass
        self.agent_mass -= self.mass_decay_rate

        # Calculate distance to closest food for reward shaping
        if len(self.foods) > 0:
            distances = [np.linalg.norm(self.agent_pos - food) for food in self.foods]
            current_distance_to_food = min(distances)
        else:
            current_distance_to_food = 0.0

        # Reward shaping: encourage moving toward food
        # Give small positive reward for getting closer, small negative for moving away
        reward = 0.01  # Small base reward for surviving
        if self.prev_distance_to_food is not None and len(self.foods) > 0:
            distance_improvement = self.prev_distance_to_food - current_distance_to_food
            # Scale the reward to be small but meaningful
            reward += distance_improvement * 0.02

        # Update previous distance for next step
        self.prev_distance_to_food = current_distance_to_food

        # Check for food collection (collision detection)
        # Agent radius is now constant, independent of mass

        foods_to_remove = []
        for i, food_pos in enumerate(self.foods):
            distance = np.linalg.norm(self.agent_pos - food_pos)
            if distance < self.agent_radius + 1.0:  # Food has radius of 1.0
                reward += 10.0
                self.agent_mass += self.food_mass_gain
                self.foods_collected += 1
                foods_to_remove.append(i)

        # Remove collected foods
        for i in reversed(foods_to_remove):
            self.foods.pop(i)

        # Spawn new food if needed
        while len(self.foods) < self.max_foods:
            food_pos = self.np_random.uniform(5, self.map_size - 5, size=2)
            self.foods.append(food_pos)

        # Update distance tracking after food changes (for next step's reward shaping)
        if len(foods_to_remove) > 0 and len(self.foods) > 0:
            distances = [np.linalg.norm(self.agent_pos - food) for food in self.foods]
            self.prev_distance_to_food = min(distances)

        # Check termination conditions
        terminated = self.agent_mass <= self.min_mass  # Starved
        truncated = self.steps >= self.max_steps  # Max steps reached

        return self._get_observation(), reward, terminated, truncated, {}

    def _get_observation(self):
        """Get the current state observation"""
        # Find closest food
        if len(self.foods) > 0:
            distances = [np.linalg.norm(self.agent_pos - food) for food in self.foods]
            closest_idx = np.argmin(distances)
            closest_food = self.foods[closest_idx]
            distance_to_food = distances[closest_idx]
        else:
            closest_food = self.agent_pos  # Fallback if no food
            distance_to_food = 0.0

        # Calculate relative angle to food
        # This tells the agent which direction to turn to face the food
        food_direction = closest_food - self.agent_pos
        angle_to_food = np.arctan2(food_direction[1], food_direction[0])
        relative_angle = angle_to_food - self.agent_angle

        # Normalize relative angle to [-pi, pi]
        relative_angle = np.arctan2(np.sin(relative_angle), np.cos(relative_angle))

        # Normalize distance (diagonal of map is max distance)
        max_distance = np.sqrt(2) * self.map_size
        normalized_distance = distance_to_food / max_distance

        obs = np.array([
            self.agent_pos[0] / self.map_size,
            self.agent_pos[1] / self.map_size,
            self.agent_angle,
            relative_angle,  # Key feature: tells agent which way to turn
            normalized_distance,  # Key feature: tells agent how far food is
            self.agent_mass / 10.0
        ], dtype=np.float32)

        return obs

    def get_survival_time(self):
        """Get current survival time (steps)"""
        return self.steps

    def render(self):
        """Render the environment (optional, for visualization)"""
        if self.render_mode is None:
            return None
        # Rendering can be implemented later with pygame or matplotlib
        pass
