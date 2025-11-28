"""
Pygbag-compatible web demo for competitive blob agents.

This is the entry point for the web version, using async/await pattern
required by Pygbag and numpy-based AI inference instead of PyTorch.

This file is self-contained and doesn't depend on gymnasium.
"""

import asyncio
import pygame
import math
import random
import numpy as np


# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
BLUE = (50, 120, 220)
RED = (220, 50, 50)
GREEN = (50, 220, 50)
GRAY = (200, 200, 200)
DARK_GRAY = (100, 100, 100)
LIGHT_BLUE = (150, 200, 255)
LIGHT_RED = (255, 150, 150)


class NumpyDQN:
    """Pure numpy implementation of the trained DQN for web compatibility."""

    def __init__(self, weights_path: str):
        data = np.load(weights_path)
        self.w1 = data['w1']
        self.b1 = data['b1']
        self.w2 = data['w2']
        self.b2 = data['b2']
        self.w3 = data['w3']
        self.b3 = data['b3']

    def forward(self, x: np.ndarray) -> np.ndarray:
        x = np.maximum(0, x @ self.w1 + self.b1)
        x = np.maximum(0, x @ self.w2 + self.b2)
        return x @ self.w3 + self.b3

    def select_action(self, state) -> int:
        q_values = self.forward(np.array(state, dtype=np.float32))
        return int(np.argmax(q_values))


class SimpleBlobEnv:
    """
    Simplified blob environment for web (no gymnasium dependency).
    """

    def __init__(self, map_size=100.0, initial_mass=5.0, mass_decay_rate=0.05,
                 movement_speed=1.2, turn_rate=0.12, food_mass_gain=1.5,
                 min_mass=0.5, max_foods=10, agent_radius=2.5):
        self.map_size = map_size
        self.initial_mass = initial_mass
        self.mass_decay_rate = mass_decay_rate
        self.movement_speed = movement_speed
        self.turn_rate = turn_rate
        self.food_mass_gain = food_mass_gain
        self.min_mass = min_mass
        self.max_foods = max_foods
        self.agent_radius = agent_radius

        self.blob1_pos = np.array([0.0, 0.0])
        self.blob1_angle = 0.0
        self.blob1_mass = initial_mass

        self.blob2_pos = np.array([0.0, 0.0])
        self.blob2_angle = 0.0
        self.blob2_mass = initial_mass

        self.foods = []
        self.steps = 0
        self.max_steps = 2000
        self.blob1_foods_collected = 0
        self.blob2_foods_collected = 0

    def reset(self):
        self.blob1_pos = np.array([
            random.uniform(10, self.map_size - 10),
            random.uniform(10, self.map_size - 10)
        ])
        self.blob1_angle = random.uniform(-math.pi, math.pi)
        self.blob1_mass = self.initial_mass

        self.blob2_pos = np.array([
            random.uniform(10, self.map_size - 10),
            random.uniform(10, self.map_size - 10)
        ])
        while np.linalg.norm(self.blob1_pos - self.blob2_pos) < self.map_size / 3:
            self.blob2_pos = np.array([
                random.uniform(10, self.map_size - 10),
                random.uniform(10, self.map_size - 10)
            ])
        self.blob2_angle = random.uniform(-math.pi, math.pi)
        self.blob2_mass = self.initial_mass

        self.foods = []
        for _ in range(self.max_foods):
            food_pos = np.array([
                random.uniform(5, self.map_size - 5),
                random.uniform(5, self.map_size - 5)
            ])
            self.foods.append(food_pos)

        self.steps = 0
        self.blob1_foods_collected = 0
        self.blob2_foods_collected = 0

        obs1 = self._get_observation(blob_id=1)
        obs2 = self._get_observation(blob_id=2)
        return (obs1, obs2), {}

    def step(self, actions):
        action1, action2 = actions
        self.steps += 1

        if action1 == 0:
            self.blob1_angle += self.turn_rate
        else:
            self.blob1_angle -= self.turn_rate
        self.blob1_angle = math.atan2(math.sin(self.blob1_angle), math.cos(self.blob1_angle))

        if action2 == 0:
            self.blob2_angle += self.turn_rate
        else:
            self.blob2_angle -= self.turn_rate
        self.blob2_angle = math.atan2(math.sin(self.blob2_angle), math.cos(self.blob2_angle))

        self.blob1_pos[0] += self.movement_speed * math.cos(self.blob1_angle)
        self.blob1_pos[1] += self.movement_speed * math.sin(self.blob1_angle)
        self.blob2_pos[0] += self.movement_speed * math.cos(self.blob2_angle)
        self.blob2_pos[1] += self.movement_speed * math.sin(self.blob2_angle)

        self.blob1_pos[0] = self.blob1_pos[0] % self.map_size
        self.blob1_pos[1] = self.blob1_pos[1] % self.map_size
        self.blob2_pos[0] = self.blob2_pos[0] % self.map_size
        self.blob2_pos[1] = self.blob2_pos[1] % self.map_size

        self.blob1_mass -= self.mass_decay_rate
        self.blob2_mass -= self.mass_decay_rate

        reward1 = 0.01
        reward2 = 0.01

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

        for i in reversed(foods_to_remove):
            self.foods.pop(i)

        while len(self.foods) < self.max_foods:
            food_pos = np.array([
                random.uniform(5, self.map_size - 5),
                random.uniform(5, self.map_size - 5)
            ])
            self.foods.append(food_pos)

        blob1_dead = self.blob1_mass <= self.min_mass
        blob2_dead = self.blob2_mass <= self.min_mass
        terminated = blob1_dead or blob2_dead
        truncated = self.steps >= self.max_steps

        obs1 = self._get_observation(blob_id=1)
        obs2 = self._get_observation(blob_id=2)

        info = {
            'blob1_mass': self.blob1_mass,
            'blob2_mass': self.blob2_mass,
            'winner': 1 if blob2_dead else (2 if blob1_dead else 0)
        }

        return (obs1, obs2), (reward1, reward2), terminated, truncated, info

    def _get_observation(self, blob_id):
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

        direction_to_other = other_pos - my_pos
        distance_to_other = np.linalg.norm(direction_to_other)
        angle_to_other = math.atan2(direction_to_other[1], direction_to_other[0])
        relative_angle_to_other = angle_to_other - my_angle
        relative_angle_to_other = math.atan2(math.sin(relative_angle_to_other),
                                             math.cos(relative_angle_to_other))

        max_distance = math.sqrt(2) * self.map_size
        normalized_distance_to_other = distance_to_other / max_distance

        if len(self.foods) > 0:
            distances_to_food = [np.linalg.norm(my_pos - food) for food in self.foods]
            closest_idx = int(np.argmin(distances_to_food))
            closest_food = self.foods[closest_idx]
            distance_to_food = distances_to_food[closest_idx]

            direction_to_food = closest_food - my_pos
            angle_to_food = math.atan2(direction_to_food[1], direction_to_food[0])
            relative_angle_to_food = angle_to_food - my_angle
            relative_angle_to_food = math.atan2(math.sin(relative_angle_to_food),
                                                math.cos(relative_angle_to_food))
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


class Particle:
    """A particle for explosion effects"""

    def __init__(self, pos, velocity, color, size, lifetime):
        self.pos = list(pos)
        self.velocity = list(velocity)
        self.color = color
        self.initial_size = size
        self.size = size
        self.lifetime = lifetime
        self.age = 0.0
        self.alpha = 255

    def update(self, dt):
        self.velocity[1] += 150.0 * dt
        self.pos[0] += self.velocity[0] * dt
        self.pos[1] += self.velocity[1] * dt
        self.velocity[0] *= 0.98
        self.velocity[1] *= 0.98
        self.age += dt
        progress = self.age / self.lifetime
        self.alpha = int(255 * (1.0 - progress))
        self.size = self.initial_size * (1.0 - progress * 0.5)

    def is_alive(self):
        return self.age < self.lifetime


class LiveBlobRenderer:
    """Pygame renderer for live competitive blob gameplay"""

    def __init__(self, width=1200, height=800, map_size=100.0, agent_radius=2.5, initial_mass=5.0):
        pygame.init()

        self.map_size = map_size
        self.agent_radius = agent_radius
        self.initial_mass = initial_mass
        self.width = width
        self.height = height
        self.screen = pygame.display.set_mode((width, height))
        pygame.display.set_caption("Blob Compete - Web Demo")

        self.game_size = min(self.width - 300, self.height - 100)
        self.game_offset_x = 50
        self.game_offset_y = 50
        self.scale = self.game_size / map_size

        self.font = pygame.font.Font(None, 24)
        self.font_large = pygame.font.Font(None, 36)
        self.font_small = pygame.font.Font(None, 20)

        self.clock = pygame.time.Clock()

        # Load blob images
        self.blob1_image_original = pygame.image.load('assets/blob1.png')
        self.blob2_image_original = pygame.image.load('assets/blob2.png')
        self.food_image_original = pygame.image.load('assets/food.png')
        trophy_image = pygame.image.load('assets/trophy.png')
        self.trophy_image = pygame.transform.scale(trophy_image, (20, 20))
        self.blob1_icon = pygame.transform.scale(self.blob1_image_original, (24, 24))
        self.blob2_icon = pygame.transform.scale(self.blob2_image_original, (24, 24))

        # Sound effects (may not work in all browsers)
        self.eat_sound = None
        self.eat2_sound = None
        try:
            pygame.mixer.init()
            self.eat_sound = pygame.mixer.Sound('assets/eat1.ogg')
            self.eat_sound.set_volume(0.5)
            self.eat2_sound = pygame.mixer.Sound('assets/eat2.ogg')
            self.eat2_sound.set_volume(0.5)
        except Exception:
            pass

        self.blob1_animation_start = None
        self.blob2_animation_start = None
        self.animation_duration = 0.4
        self.food_rotation_speeds = {}
        self.particles = []

    def world_to_screen(self, pos):
        x = self.game_offset_x + pos[0] * self.scale
        y = self.game_offset_y + pos[1] * self.scale
        return (int(x), int(y))

    def bounce_curve(self, t):
        if t >= 1.0:
            return 1.0
        amplitude = 0.15
        bounce_factor = 2.0
        scale = 1.0 + amplitude * math.exp(-bounce_factor * t) * math.cos(2 * math.pi * bounce_factor * t)
        return scale

    def get_animation_scale(self, blob_id):
        current_time = pygame.time.get_ticks() / 1000.0
        if blob_id == 1 and self.blob1_animation_start is not None:
            elapsed = current_time - self.blob1_animation_start
            if elapsed < self.animation_duration:
                return self.bounce_curve(elapsed / self.animation_duration)
            else:
                self.blob1_animation_start = None
        elif blob_id == 2 and self.blob2_animation_start is not None:
            elapsed = current_time - self.blob2_animation_start
            if elapsed < self.animation_duration:
                return self.bounce_curve(elapsed / self.animation_duration)
            else:
                self.blob2_animation_start = None
        return 1.0

    def trigger_food_animation(self, blob_id):
        current_time = pygame.time.get_ticks() / 1000.0
        if blob_id == 1:
            self.blob1_animation_start = current_time
        elif blob_id == 2:
            self.blob2_animation_start = current_time
        if random.random() < 0.2 and self.eat2_sound:
            self.eat2_sound.play()
        elif self.eat_sound:
            self.eat_sound.play()

    def create_explosion(self, pos, mass, blob_color):
        num_particles = int(30 + mass * 5)
        num_particles = min(num_particles, 150)
        if blob_color == 'blue':
            colors = [BLUE, LIGHT_BLUE, WHITE, (100, 150, 255)]
        else:
            colors = [RED, LIGHT_RED, WHITE, (255, 100, 100)]
        for _ in range(num_particles):
            angle = random.uniform(0, 2 * math.pi)
            speed = random.uniform(50, 200)
            vx = math.cos(angle) * speed
            vy = math.sin(angle) * speed
            color = random.choice(colors)
            size = random.uniform(2, 6)
            lifetime = random.uniform(0.5, 1.5)
            screen_pos = self.world_to_screen(pos)
            particle = Particle(screen_pos, (vx, vy), color, size, lifetime)
            self.particles.append(particle)

    def update_particles(self, dt):
        for particle in self.particles:
            particle.update(dt)
        self.particles = [p for p in self.particles if p.is_alive()]

    def draw_particles(self):
        for particle in self.particles:
            size = int(particle.size * 2)
            if size < 1:
                continue
            particle_surface = pygame.Surface((size, size), pygame.SRCALPHA)
            color_with_alpha = particle.color + (particle.alpha,)
            pygame.draw.circle(particle_surface, color_with_alpha, (size // 2, size // 2), int(particle.size))
            self.screen.blit(particle_surface, (int(particle.pos[0] - size // 2), int(particle.pos[1] - size // 2)))

    def draw_blob(self, pos, angle, mass, base_hue, blob_id):
        screen_pos = self.world_to_screen(pos)
        if base_hue == 'blue':
            original_image = self.blob1_image_original
        else:
            original_image = self.blob2_image_original
        base_size = int(self.agent_radius * self.scale * 2)
        mass_scale_factor = mass / self.initial_mass
        animation_scale = self.get_animation_scale(blob_id)
        current_size = int(base_size * mass_scale_factor * animation_scale)
        current_size = max(10, current_size)
        scaled_image = pygame.transform.scale(original_image, (current_size, current_size))
        facing_left = abs(angle) > math.pi / 2
        if facing_left:
            scaled_image = pygame.transform.flip(scaled_image, False, True)
            angle_degrees = math.degrees(angle)
        else:
            angle_degrees = -math.degrees(angle)
        rotated_image = pygame.transform.rotate(scaled_image, angle_degrees)
        rect = rotated_image.get_rect(center=screen_pos)
        self.screen.blit(rotated_image, rect)

    def draw_trophies(self, x, y, count, max_width):
        if count == 0:
            return 0
        trophy_size = 20
        spacing = 5
        trophies_per_row = max((max_width - spacing) // (trophy_size + spacing), 1)
        rows = (count + trophies_per_row - 1) // trophies_per_row
        for i in range(count):
            row = i // trophies_per_row
            col = i % trophies_per_row
            trophy_x = x + col * (trophy_size + spacing)
            trophy_y = y + row * (trophy_size + spacing)
            self.screen.blit(self.trophy_image, (trophy_x, trophy_y))
        return rows * (trophy_size + spacing)

    def draw_food(self, pos):
        screen_pos = self.world_to_screen(pos)
        food_size = int(1.0 * self.scale * 3)
        food_size = max(8, food_size)
        scaled_food = pygame.transform.scale(self.food_image_original, (food_size, food_size))
        pos_key = (round(pos[0], 1), round(pos[1], 1))
        if pos_key not in self.food_rotation_speeds:
            hash_val = hash(pos_key) % 1000 / 1000.0
            self.food_rotation_speeds[pos_key] = 30 + hash_val * 90
        rotation_speed = self.food_rotation_speeds[pos_key]
        current_time = pygame.time.get_ticks() / 1000.0
        rotation_angle = (current_time * rotation_speed) % 360
        rotated_food = pygame.transform.rotate(scaled_food, rotation_angle)
        rect = rotated_food.get_rect(center=screen_pos)
        self.screen.blit(rotated_food, rect)

    def draw_stats(self, env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins):
        stats_x = self.game_offset_x + self.game_size + 30
        stats_y = self.game_offset_y
        stats_width = 250

        title = self.font_large.render(f"Episode #{episode_num}", True, WHITE)
        self.screen.blit(title, (stats_x, stats_y))
        y_offset = stats_y + 50

        frame_text = self.font.render(f"Step: {env.steps}", True, WHITE)
        self.screen.blit(frame_text, (stats_x, y_offset))
        y_offset += 40

        self.screen.blit(self.font.render("WINS", True, WHITE), (stats_x, y_offset))
        y_offset += 30

        self.screen.blit(self.blob1_icon, (stats_x + 10, y_offset))
        wins_text = self.font.render(f"{blob1_wins}", True, LIGHT_BLUE)
        self.screen.blit(wins_text, (stats_x + 10 + 24 + 8, y_offset + 4))
        y_offset += 30
        if blob1_wins > 0:
            trophy_height = self.draw_trophies(stats_x + 10, y_offset, blob1_wins, stats_width - 20)
            y_offset += trophy_height + 10
        else:
            y_offset += 10

        self.screen.blit(self.blob2_icon, (stats_x + 10, y_offset))
        wins_text = self.font.render(f"{blob2_wins}", True, LIGHT_RED)
        self.screen.blit(wins_text, (stats_x + 10 + 24 + 8, y_offset + 4))
        y_offset += 30
        if blob2_wins > 0:
            trophy_height = self.draw_trophies(stats_x + 10, y_offset, blob2_wins, stats_width - 20)
            y_offset += trophy_height + 10
        else:
            y_offset += 10

        y_offset += 20

        self.screen.blit(self.blob1_icon, (stats_x, y_offset))
        y_offset += 30
        self.screen.blit(self.font_small.render(f"Mass: {env.blob1_mass:.2f}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 25
        self.screen.blit(self.font_small.render(f"Foods: {blob1_foods}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 35

        self.screen.blit(self.blob2_icon, (stats_x, y_offset))
        y_offset += 30
        self.screen.blit(self.font_small.render(f"Mass: {env.blob2_mass:.2f}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 25
        self.screen.blit(self.font_small.render(f"Foods: {blob2_foods}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 35

        if env.blob1_mass <= env.min_mass:
            self.screen.blit(self.blob2_icon, (stats_x, y_offset))
            status_text = self.font.render("WINS!", True, LIGHT_RED)
            self.screen.blit(status_text, (stats_x + 24 + 8, y_offset + 4))
        elif env.blob2_mass <= env.min_mass:
            self.screen.blit(self.blob1_icon, (stats_x, y_offset))
            status_text = self.font.render("WINS!", True, LIGHT_BLUE)
            self.screen.blit(status_text, (stats_x + 24 + 8, y_offset + 4))
        else:
            status_text = self.font.render("COMPETING...", True, GREEN)
            self.screen.blit(status_text, (stats_x, y_offset))

    def draw_controls(self):
        controls_y = self.height - 30
        controls = ["Controls: SPACE=Pause/Resume | R=Reset"]
        for i, text in enumerate(controls):
            surf = self.font_small.render(text, True, GRAY)
            self.screen.blit(surf, (self.game_offset_x, controls_y + i * 25))

    def render_frame(self, env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins, dt=0.0):
        if dt > 0:
            self.update_particles(dt)
        self.screen.fill(BLACK)
        game_rect = pygame.Rect(self.game_offset_x, self.game_offset_y, self.game_size, self.game_size)
        pygame.draw.rect(self.screen, DARK_GRAY, game_rect, 2)
        for food_pos in env.foods:
            self.draw_food(food_pos)
        self.draw_blob(env.blob1_pos, env.blob1_angle, env.blob1_mass, 'blue', blob_id=1)
        self.draw_blob(env.blob2_pos, env.blob2_angle, env.blob2_mass, 'red', blob_id=2)
        self.draw_particles()
        self.draw_stats(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins)
        self.draw_controls()
        pygame.display.flip()

    def close(self):
        try:
            pygame.mixer.quit()
        except Exception:
            pass
        pygame.quit()


async def main():
    """Main async game loop for Pygbag"""
    # Load AI agents
    agent1 = NumpyDQN('blob1_weights.npz')
    agent2 = NumpyDQN('blob2_weights.npz')

    # Create environment and renderer
    env = SimpleBlobEnv(max_foods=10)
    renderer = LiveBlobRenderer(
        map_size=env.map_size,
        agent_radius=env.agent_radius,
        initial_mass=env.initial_mass
    )

    # Game state
    episode_num = 1
    (state1, state2), _ = env.reset()
    done = False
    paused = False
    blob1_foods = 0
    blob2_foods = 0
    blob1_wins = 0
    blob2_wins = 0
    blob1_alive = True
    blob2_alive = True

    fps = 30
    last_time = pygame.time.get_ticks() / 1000.0
    running = True

    while running:
        current_time = pygame.time.get_ticks() / 1000.0
        dt = current_time - last_time
        last_time = current_time

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_q or event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    paused = not paused
                elif event.key == pygame.K_r:
                    episode_num += 1
                    (state1, state2), _ = env.reset()
                    done = False
                    blob1_foods = 0
                    blob2_foods = 0
                    blob1_alive = True
                    blob2_alive = True
                    renderer.blob1_animation_start = None
                    renderer.blob2_animation_start = None
                    renderer.food_rotation_speeds.clear()
                    renderer.particles.clear()

        if not paused:
            if not done:
                action1 = agent1.select_action(state1)
                action2 = agent2.select_action(state2)

                prev_blob1_foods = env.blob1_foods_collected
                prev_blob2_foods = env.blob2_foods_collected

                (next_state1, next_state2), (reward1, reward2), terminated, truncated, info = env.step((action1, action2))
                done = terminated or truncated

                blob1_foods = env.blob1_foods_collected
                blob2_foods = env.blob2_foods_collected

                if blob1_foods > prev_blob1_foods:
                    renderer.trigger_food_animation(1)
                if blob2_foods > prev_blob2_foods:
                    renderer.trigger_food_animation(2)

                if blob1_alive and env.blob1_mass <= env.min_mass:
                    renderer.create_explosion(env.blob1_pos, env.blob1_mass, 'blue')
                    blob1_alive = False
                if blob2_alive and env.blob2_mass <= env.min_mass:
                    renderer.create_explosion(env.blob2_pos, env.blob2_mass, 'red')
                    blob2_alive = False

                state1 = next_state1
                state2 = next_state2

                if done:
                    winner = info['winner']
                    if winner == 1:
                        blob1_wins += 1
                    elif winner == 2:
                        blob2_wins += 1

                    # Brief pause to show results
                    for _ in range(20):
                        renderer.render_frame(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins, dt)
                        await asyncio.sleep(0.1)

                    episode_num += 1
                    (state1, state2), _ = env.reset()
                    done = False
                    blob1_foods = 0
                    blob2_foods = 0
                    blob1_alive = True
                    blob2_alive = True
                    renderer.blob1_animation_start = None
                    renderer.blob2_animation_start = None
                    renderer.food_rotation_speeds.clear()
                    renderer.particles.clear()

            renderer.render_frame(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins, dt)
        else:
            renderer.render_frame(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins, 0.0)

        renderer.clock.tick(fps)
        await asyncio.sleep(0)  # Required for Pygbag

    renderer.close()


asyncio.run(main())
