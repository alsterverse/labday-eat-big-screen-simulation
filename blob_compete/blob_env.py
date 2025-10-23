"""
Custom Gymnasium environment for competitive blob game.

Two blobs compete for survival by collecting food.
- Each blob can steer left or right, always moving forward
- Blobs have constant radius (independent of mass)
- Mass decays each step
- Food pellets provide mass gain
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
import math


class BlobCompeteEnv(gym.Env):
    """
    Competitive Blob Environment (2 blobs)

    State (per blob):
        - agent_x, agent_y: Own position (normalized)
        - agent_angle: Own heading direction
        - agent_mass: Own mass (normalized)
        - distance_to_other: Distance to opponent blob
        - relative_angle_to_other: Angle to turn to face opponent
        - distance_to_food: Distance to closest food
        - relative_angle_to_food: Angle to turn to face food

    Actions:
        0: Steer left
        1: Steer right

    Rewards:
        +5 for collecting food
        +0.01 base reward for surviving each step
        Episode ends when one blob's mass reaches minimum threshold
    """

    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 30}

    def __init__(self, render_mode=None, map_size=100.0, initial_mass=5.0,
                 mass_decay_rate=0.05, movement_speed=1.2, turn_rate=0.12,
                 food_mass_gain=1.5, min_mass=0.5, max_foods=10, agent_radius=2.5,
                 mass_steal_rate=0.15):
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
        self.agent_radius = agent_radius
        self.mass_steal_rate = mass_steal_rate  # Mass stolen per collision

        # State: 8 features per blob
        # [agent_x, agent_y, agent_angle, agent_mass,
        #  distance_to_other, relative_angle_to_other,
        #  distance_to_food, relative_angle_to_food]
        self.observation_space = spaces.Box(
            low=np.array([0.0, 0.0, -np.pi, 0.0, 0.0, -np.pi, 0.0, -np.pi]),
            high=np.array([1.0, 1.0, np.pi, 15.0, 1.0, np.pi, 1.0, np.pi]),
            dtype=np.float32
        )

        # Actions: 0 = steer left, 1 = steer right
        self.action_space = spaces.Discrete(2)

        # Blob 1 state
        self.blob1_pos = np.array([0.0, 0.0])
        self.blob1_angle = 0.0
        self.blob1_mass = initial_mass

        # Blob 2 state
        self.blob2_pos = np.array([0.0, 0.0])
        self.blob2_angle = 0.0
        self.blob2_mass = initial_mass

        # Food pellets
        self.foods = []

        # Episode tracking
        self.steps = 0
        self.max_steps = 2000
        self.blob1_foods_collected = 0
        self.blob2_foods_collected = 0
        self.blob1_mass_stolen = 0
        self.blob2_mass_stolen = 0

        # For reward shaping
        self.prev_distance_between_blobs = None

        self.render_mode = render_mode

    def reset(self, seed=None, options=None):
        """Reset the environment to initial state"""
        super().reset(seed=seed)

        # Reset blob 1 to random position
        self.blob1_pos = self.np_random.uniform(10, self.map_size - 10, size=2)
        self.blob1_angle = self.np_random.uniform(-np.pi, np.pi)
        self.blob1_mass = self.initial_mass

        # Reset blob 2 to random position (far from blob 1)
        self.blob2_pos = self.np_random.uniform(10, self.map_size - 10, size=2)
        # Ensure blobs start far apart
        while np.linalg.norm(self.blob1_pos - self.blob2_pos) < self.map_size / 3:
            self.blob2_pos = self.np_random.uniform(10, self.map_size - 10, size=2)
        self.blob2_angle = self.np_random.uniform(-np.pi, np.pi)
        self.blob2_mass = self.initial_mass

        # Spawn food pellets
        self.foods = []
        for _ in range(self.max_foods):
            food_pos = self.np_random.uniform(5, self.map_size - 5, size=2)
            self.foods.append(food_pos)

        self.steps = 0
        self.blob1_foods_collected = 0
        self.blob2_foods_collected = 0
        self.blob1_mass_stolen = 0
        self.blob2_mass_stolen = 0

        # Initialize distance tracking
        self.prev_distance_between_blobs = np.linalg.norm(self.blob1_pos - self.blob2_pos)

        # Return observations for both blobs
        obs1 = self._get_observation(blob_id=1)
        obs2 = self._get_observation(blob_id=2)
        return (obs1, obs2), {}

    def step(self, actions):
        """
        Execute one step in the environment

        Args:
            actions: tuple of (action1, action2) for blob1 and blob2

        Returns:
            (obs1, obs2): observations for both blobs
            (reward1, reward2): rewards for both blobs
            terminated: whether episode ended
            truncated: whether max steps reached
            info: additional info
        """
        action1, action2 = actions
        self.steps += 1

        # Apply steering for blob 1
        if action1 == 0:
            self.blob1_angle += self.turn_rate
        else:
            self.blob1_angle -= self.turn_rate
        self.blob1_angle = np.arctan2(np.sin(self.blob1_angle), np.cos(self.blob1_angle))

        # Apply steering for blob 2
        if action2 == 0:
            self.blob2_angle += self.turn_rate
        else:
            self.blob2_angle -= self.turn_rate
        self.blob2_angle = np.arctan2(np.sin(self.blob2_angle), np.cos(self.blob2_angle))

        # Move both blobs forward
        self.blob1_pos[0] += self.movement_speed * np.cos(self.blob1_angle)
        self.blob1_pos[1] += self.movement_speed * np.sin(self.blob1_angle)
        self.blob2_pos[0] += self.movement_speed * np.cos(self.blob2_angle)
        self.blob2_pos[1] += self.movement_speed * np.sin(self.blob2_angle)

        # Keep blobs within bounds (wrap around)
        self.blob1_pos[0] = self.blob1_pos[0] % self.map_size
        self.blob1_pos[1] = self.blob1_pos[1] % self.map_size
        self.blob2_pos[0] = self.blob2_pos[0] % self.map_size
        self.blob2_pos[1] = self.blob2_pos[1] % self.map_size

        # Decay mass for both blobs
        self.blob1_mass -= self.mass_decay_rate
        self.blob2_mass -= self.mass_decay_rate

        # Calculate distance between blobs
        distance_between_blobs = np.linalg.norm(self.blob1_pos - self.blob2_pos)

        # Initialize rewards
        reward1 = 0.01  # Base survival reward
        reward2 = 0.01

        # Check for food collection by blob 1
        foods_to_remove = []
        for i, food_pos in enumerate(self.foods):
            distance1 = np.linalg.norm(self.blob1_pos - food_pos)
            distance2 = np.linalg.norm(self.blob2_pos - food_pos)

            if distance1 < self.agent_radius + 1.0:
                reward1 += 5.0
                self.blob1_mass += self.food_mass_gain
                self.blob1_foods_collected += 1
                foods_to_remove.append(i)
            elif distance2 < self.agent_radius + 1.0:
                reward2 += 5.0
                self.blob2_mass += self.food_mass_gain
                self.blob2_foods_collected += 1
                foods_to_remove.append(i)

        # Remove collected foods
        for i in reversed(foods_to_remove):
            self.foods.pop(i)

        # Spawn new food if needed
        while len(self.foods) < self.max_foods:
            food_pos = self.np_random.uniform(5, self.map_size - 5, size=2)
            self.foods.append(food_pos)

        # Check termination conditions
        blob1_dead = self.blob1_mass <= self.min_mass
        blob2_dead = self.blob2_mass <= self.min_mass
        terminated = blob1_dead or blob2_dead
        truncated = self.steps >= self.max_steps

        # Get observations
        obs1 = self._get_observation(blob_id=1)
        obs2 = self._get_observation(blob_id=2)

        # Create info dict
        info = {
            'blob1_mass': self.blob1_mass,
            'blob2_mass': self.blob2_mass,
            'blob1_foods': self.blob1_foods_collected,
            'blob2_foods': self.blob2_foods_collected,
            'blob1_stolen': self.blob1_mass_stolen,
            'blob2_stolen': self.blob2_mass_stolen,
            'winner': 1 if blob2_dead else (2 if blob1_dead else 0)
        }

        return (obs1, obs2), (reward1, reward2), terminated, truncated, info

    def _get_observation(self, blob_id):
        """
        Get observation for a specific blob

        Args:
            blob_id: 1 for blob1, 2 for blob2
        """
        if blob_id == 1:
            my_pos = self.blob1_pos
            my_angle = self.blob1_angle
            my_mass = self.blob1_mass
            other_pos = self.blob2_pos
        else:
            my_pos = self.blob2_pos
            my_angle = self.blob2_angle
            my_mass = self.blob2_mass
            other_pos = self.blob1_pos

        # Distance and angle to other blob
        direction_to_other = other_pos - my_pos
        distance_to_other = np.linalg.norm(direction_to_other)
        angle_to_other = np.arctan2(direction_to_other[1], direction_to_other[0])
        relative_angle_to_other = angle_to_other - my_angle
        relative_angle_to_other = np.arctan2(np.sin(relative_angle_to_other),
                                             np.cos(relative_angle_to_other))

        # Normalize distance to other blob
        max_distance = np.sqrt(2) * self.map_size
        normalized_distance_to_other = distance_to_other / max_distance

        # Distance and angle to closest food
        if len(self.foods) > 0:
            distances_to_food = [np.linalg.norm(my_pos - food) for food in self.foods]
            closest_idx = np.argmin(distances_to_food)
            closest_food = self.foods[closest_idx]
            distance_to_food = distances_to_food[closest_idx]

            direction_to_food = closest_food - my_pos
            angle_to_food = np.arctan2(direction_to_food[1], direction_to_food[0])
            relative_angle_to_food = angle_to_food - my_angle
            relative_angle_to_food = np.arctan2(np.sin(relative_angle_to_food),
                                               np.cos(relative_angle_to_food))
            normalized_distance_to_food = distance_to_food / max_distance
        else:
            relative_angle_to_food = 0.0
            normalized_distance_to_food = 1.0

        obs = np.array([
            my_pos[0] / self.map_size,
            my_pos[1] / self.map_size,
            my_angle,
            my_mass / 10.0,
            normalized_distance_to_other,
            relative_angle_to_other,
            normalized_distance_to_food,
            relative_angle_to_food
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
