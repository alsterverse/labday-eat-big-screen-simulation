"""
Live Pygame demo for competitive blob agents.

Watch two trained DQN agents compete in real-time, collecting food and surviving.
The game resets automatically when one blob dies.
"""

import pygame
import sys
import math
import os
import torch
import numpy as np
import random
from blob_env import BlobCompeteEnv
from train_blob import DQN


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


class LiveBlobRenderer:
    """Pygame renderer for live competitive blob gameplay"""

    def __init__(self, width=1200, height=800, map_size=100.0, agent_radius=2.5, initial_mass=5.0):
        pygame.init()
        pygame.mixer.init()
        self.width = width
        self.height = height
        self.map_size = map_size
        self.agent_radius = agent_radius
        self.initial_mass = initial_mass

        # Calculate game area (square)
        self.game_size = min(width - 300, height - 100)  # Leave room for stats
        self.game_offset_x = 50
        self.game_offset_y = 50

        # Scale factor for rendering
        self.scale = self.game_size / map_size

        self.screen = pygame.display.set_mode((width, height))
        pygame.display.set_caption("Blob Compete - Live Demo")

        self.font = pygame.font.Font(None, 24)
        self.font_large = pygame.font.Font(None, 36)
        self.font_small = pygame.font.Font(None, 20)

        self.clock = pygame.time.Clock()

        # Load blob images
        script_dir = os.path.dirname(os.path.abspath(__file__))
        assets_dir = os.path.join(script_dir, 'assets')
        blob1_path = os.path.join(assets_dir, 'blob1.png')
        blob2_path = os.path.join(assets_dir, 'blob2.png')

        # Load original images (will be scaled dynamically based on mass)
        self.blob1_image_original = pygame.image.load(blob1_path)
        self.blob2_image_original = pygame.image.load(blob2_path)

        # Load sound effects
        eat1_sound_path = os.path.join(assets_dir, 'eat1.ogg')
        eat2_sound_path = os.path.join(assets_dir, 'eat2.ogg')
        try:
            self.eat_sound = pygame.mixer.Sound(eat1_sound_path)
            self.eat_sound.set_volume(0.5)  # Set volume to 50%
        except Exception as e:
            print(f"Warning: Could not load eat1.ogg sound: {e}")
            self.eat_sound = None

        try:
            self.eat2_sound = pygame.mixer.Sound(eat2_sound_path)
            self.eat2_sound.set_volume(0.5)  # Set volume to 50%
        except Exception as e:
            print(f"Warning: Could not load eat2.ogg sound: {e}")
            self.eat2_sound = None

        # Animation state for food collection
        self.blob1_animation_start = None
        self.blob2_animation_start = None
        self.animation_duration = 0.4  # seconds

    def world_to_screen(self, pos):
        """Convert world coordinates to screen coordinates"""
        x = self.game_offset_x + pos[0] * self.scale
        y = self.game_offset_y + pos[1] * self.scale
        return (int(x), int(y))

    def bounce_curve(self, t):
        """
        Bounce easing curve for animation
        t: progress from 0.0 to 1.0
        Returns scale multiplier (starts at 1.0, peaks higher, settles back to 1.0)
        """
        if t >= 1.0:
            return 1.0

        # Elastic bounce effect
        # Goes from 1.0 -> 1.15 (peak) -> 0.975 (undershoot) -> 1.0
        amplitude = 0.15
        bounce_factor = 2.0

        scale = 1.0 + amplitude * math.exp(-bounce_factor * t) * math.cos(2 * math.pi * bounce_factor * t)
        return scale

    def get_animation_scale(self, blob_id):
        """Get current animation scale for a blob (1 or 2)"""
        current_time = pygame.time.get_ticks() / 1000.0  # Convert to seconds

        if blob_id == 1 and self.blob1_animation_start is not None:
            elapsed = current_time - self.blob1_animation_start
            if elapsed < self.animation_duration:
                t = elapsed / self.animation_duration
                return self.bounce_curve(t)
            else:
                self.blob1_animation_start = None
        elif blob_id == 2 and self.blob2_animation_start is not None:
            elapsed = current_time - self.blob2_animation_start
            if elapsed < self.animation_duration:
                t = elapsed / self.animation_duration
                return self.bounce_curve(t)
            else:
                self.blob2_animation_start = None

        return 1.0

    def trigger_food_animation(self, blob_id):
        """Trigger food collection animation for a blob"""
        current_time = pygame.time.get_ticks() / 1000.0
        if blob_id == 1:
            self.blob1_animation_start = current_time
        elif blob_id == 2:
            self.blob2_animation_start = current_time

        # Play eat sound effect (80% eat.ogg, 20% eat2.ogg)
        if random.random() < 0.2 and self.eat2_sound:
            self.eat2_sound.play()
        elif self.eat_sound:
            self.eat_sound.play()

    def draw_blob(self, pos, angle, mass, base_hue, blob_id):
        """Draw a blob using image sprite, scaled by mass, mirrored when facing left"""
        screen_pos = self.world_to_screen(pos)

        # Select appropriate blob image
        if base_hue == 'blue':
            original_image = self.blob1_image_original
        else:
            original_image = self.blob2_image_original

        # Calculate size based on mass
        base_size = int(self.agent_radius * self.scale * 2)
        mass_scale_factor = mass / self.initial_mass

        # Apply animation scale on top of mass scale
        animation_scale = self.get_animation_scale(blob_id)
        current_size = int(base_size * mass_scale_factor * animation_scale)

        # Ensure minimum size
        current_size = max(10, current_size)

        # Scale image to current size
        scaled_image = pygame.transform.scale(original_image, (current_size, current_size))

        # Determine if blob is facing left (needs mirroring to stay upright)
        facing_left = abs(angle) > math.pi / 2

        if facing_left:
            # Flip image vertically
            scaled_image = pygame.transform.flip(scaled_image, False, True)
            angle_degrees = math.degrees(angle)
        else:
            # Normal angle conversion
            angle_degrees = -math.degrees(angle)

        # Rotate the scaled image
        rotated_image = pygame.transform.rotate(scaled_image, angle_degrees)

        # Get rect centered on the blob position
        rect = rotated_image.get_rect(center=screen_pos)

        # Draw the rotated image
        self.screen.blit(rotated_image, rect)

    def draw_food(self, pos):
        """Draw a food pellet"""
        screen_pos = self.world_to_screen(pos)
        radius = int(1.0 * self.scale)  # Food radius is 1.0
        pygame.draw.circle(self.screen, GREEN, screen_pos, radius)
        pygame.draw.circle(self.screen, (100, 255, 100), screen_pos, radius, 1)

    def draw_stats(self, env, episode_num, blob1_foods, blob2_foods):
        """Draw statistics panel"""
        stats_x = self.game_offset_x + self.game_size + 30
        stats_y = self.game_offset_y

        # Episode info
        title = self.font_large.render(f"Episode #{episode_num}", True, WHITE)
        self.screen.blit(title, (stats_x, stats_y))

        y_offset = stats_y + 50

        # Frame counter
        frame_text = self.font.render(f"Step: {env.steps}", True, WHITE)
        self.screen.blit(frame_text, (stats_x, y_offset))
        y_offset += 40

        # Blob 1 (Blue) stats
        self.screen.blit(self.font.render("BLOB 1 (Blue)", True, LIGHT_BLUE), (stats_x, y_offset))
        y_offset += 30
        self.screen.blit(self.font_small.render(f"Mass: {env.blob1_mass:.2f}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 25
        self.screen.blit(self.font_small.render(f"Foods: {blob1_foods}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 35

        # Blob 2 (Red) stats
        self.screen.blit(self.font.render("BLOB 2 (Red)", True, LIGHT_RED), (stats_x, y_offset))
        y_offset += 30
        self.screen.blit(self.font_small.render(f"Mass: {env.blob2_mass:.2f}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 25
        self.screen.blit(self.font_small.render(f"Foods: {blob2_foods}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 35

        # Status
        if env.blob1_mass <= env.min_mass:
            status = "BLOB 2 WINS!"
            status_color = LIGHT_RED
        elif env.blob2_mass <= env.min_mass:
            status = "BLOB 1 WINS!"
            status_color = LIGHT_BLUE
        else:
            status = "COMPETING..."
            status_color = GREEN

        self.screen.blit(self.font.render(status, True, status_color), (stats_x, y_offset))

    def draw_controls(self):
        """Draw control instructions at bottom"""
        controls_y = self.height - 30
        controls = [
            "Controls: SPACE=Pause/Resume | R=Reset | Q=Quit"
        ]
        for i, text in enumerate(controls):
            surf = self.font_small.render(text, True, GRAY)
            self.screen.blit(surf, (self.game_offset_x, controls_y + i * 25))

    def render_frame(self, env, episode_num, blob1_foods, blob2_foods):
        """Render current game state"""
        self.screen.fill(BLACK)

        # Draw game area border
        game_rect = pygame.Rect(
            self.game_offset_x,
            self.game_offset_y,
            self.game_size,
            self.game_size
        )
        pygame.draw.rect(self.screen, DARK_GRAY, game_rect, 2)

        # Draw food pellets
        for food_pos in env.foods:
            self.draw_food(food_pos)

        # Draw blobs
        self.draw_blob(env.blob1_pos, env.blob1_angle, env.blob1_mass, 'blue', blob_id=1)
        self.draw_blob(env.blob2_pos, env.blob2_angle, env.blob2_mass, 'red', blob_id=2)

        # Draw stats
        self.draw_stats(env, episode_num, blob1_foods, blob2_foods)

        # Draw controls
        self.draw_controls()

        pygame.display.flip()

    def close(self):
        """Clean up"""
        pygame.mixer.quit()
        pygame.quit()


def load_agents(model1_path='blob_compete/blob1_model.pth',
                model2_path='blob_compete/blob2_model.pth'):
    """Load trained agent models"""
    # Create environment to get state/action sizes
    env = BlobCompeteEnv()
    state_size = env.observation_space.shape[0]
    action_size = env.action_space.n

    # Load models
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    agent1_network = DQN(state_size, action_size).to(device)
    agent2_network = DQN(state_size, action_size).to(device)

    try:
        agent1_network.load_state_dict(torch.load(model1_path, map_location=device))
        agent2_network.load_state_dict(torch.load(model2_path, map_location=device))
        agent1_network.eval()
        agent2_network.eval()
        print(f"Loaded trained models from {model1_path} and {model2_path}")
        return agent1_network, agent2_network, device
    except FileNotFoundError as e:
        print(f"Error: Could not load models: {e}")
        print("Please train the agents first by running: python blob_compete/train_blob.py")
        return None, None, None


def select_action(network, state, device):
    """Select action using trained network (greedy)"""
    with torch.no_grad():
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(device)
        q_values = network(state_tensor)
        return q_values.argmax().item()


def live_demo(fps=30):
    """
    Run live demo of competitive blob agents

    Args:
        fps: Frames per second for rendering
    """
    # Load agents
    agent1_network, agent2_network, device = load_agents()
    if agent1_network is None or agent2_network is None:
        return

    # Create environment and renderer
    env = BlobCompeteEnv()
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

    print("\n" + "=" * 60)
    print("BLOB COMPETE - LIVE DEMO")
    print("=" * 60)
    print("\nControls:")
    print("  SPACE - Pause/Resume")
    print("  R     - Reset episode")
    print("  Q     - Quit")
    print("=" * 60)
    print("\nStarting Episode 1...")

    running = True
    while running:
        # Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_q:
                    running = False
                elif event.key == pygame.K_SPACE:
                    paused = not paused
                    print("Paused" if paused else "Resumed")
                elif event.key == pygame.K_r:
                    # Reset episode
                    episode_num += 1
                    (state1, state2), _ = env.reset()
                    done = False
                    blob1_foods = 0
                    blob2_foods = 0
                    renderer.blob1_animation_start = None
                    renderer.blob2_animation_start = None
                    print(f"\nReset! Starting Episode {episode_num}...")

        if not paused:
            if not done:
                # Select actions for both agents
                action1 = select_action(agent1_network, state1, device)
                action2 = select_action(agent2_network, state2, device)

                # Track previous food counts
                prev_blob1_foods = env.blob1_foods_collected
                prev_blob2_foods = env.blob2_foods_collected

                # Step environment
                (next_state1, next_state2), (reward1, reward2), terminated, truncated, info = env.step((action1, action2))
                done = terminated or truncated

                # Update food counts
                blob1_foods = env.blob1_foods_collected
                blob2_foods = env.blob2_foods_collected

                # Trigger animations when food is collected
                if blob1_foods > prev_blob1_foods:
                    renderer.trigger_food_animation(1)
                if blob2_foods > prev_blob2_foods:
                    renderer.trigger_food_animation(2)

                # Update states
                state1 = next_state1
                state2 = next_state2

                # Check if episode ended
                if done:
                    winner = info['winner']
                    if winner == 1:
                        print(f"\nEpisode {episode_num} ended! BLOB 1 WINS!")
                    elif winner == 2:
                        print(f"\nEpisode {episode_num} ended! BLOB 2 WINS!")
                    else:
                        print(f"\nEpisode {episode_num} ended! DRAW!")

                    print(f"  Steps: {env.steps}")
                    print(f"  Blob 1 foods: {blob1_foods}")
                    print(f"  Blob 2 foods: {blob2_foods}")
                    print(f"  Final masses: Blob1={env.blob1_mass:.2f}, Blob2={env.blob2_mass:.2f}")

                    # Auto-reset after brief pause
                    renderer.render_frame(env, episode_num, blob1_foods, blob2_foods)
                    pygame.time.wait(2000)  # Wait 2 seconds

                    episode_num += 1
                    (state1, state2), _ = env.reset()
                    done = False
                    blob1_foods = 0
                    blob2_foods = 0
                    renderer.blob1_animation_start = None
                    renderer.blob2_animation_start = None
                    print(f"\nStarting Episode {episode_num}...")

            # Render current state
            renderer.render_frame(env, episode_num, blob1_foods, blob2_foods)

        renderer.clock.tick(fps)

    renderer.close()
    print("\nDemo finished!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Live demo of competitive blob agents')
    parser.add_argument('--fps', type=int, default=30,
                       help='Frames per second (default: 30)')

    args = parser.parse_args()

    live_demo(args.fps)
