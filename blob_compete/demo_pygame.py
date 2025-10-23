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

    def __init__(self, width=1200, height=800, map_size=100.0, agent_radius=2.5, initial_mass=5.0, fullscreen=False):
        pygame.init()
        pygame.mixer.init()
        self.map_size = map_size
        self.agent_radius = agent_radius
        self.initial_mass = initial_mass

        # Create display (fullscreen or windowed)
        if fullscreen:
            self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
            self.width = self.screen.get_width()
            self.height = self.screen.get_height()
        else:
            self.width = width
            self.height = height
            self.screen = pygame.display.set_mode((width, height))

        pygame.display.set_caption("Blob Compete - Live Demo")

        # Calculate game area (square)
        self.game_size = min(self.width - 300, self.height - 100)  # Leave room for stats
        self.game_offset_x = 50
        self.game_offset_y = 50

        # Scale factor for rendering
        self.scale = self.game_size / map_size

        self.font = pygame.font.Font(None, 24)
        self.font_large = pygame.font.Font(None, 36)
        self.font_small = pygame.font.Font(None, 20)

        self.clock = pygame.time.Clock()

        # Load blob images
        script_dir = os.path.dirname(os.path.abspath(__file__))
        assets_dir = os.path.join(script_dir, 'assets')
        blob1_path = os.path.join(assets_dir, 'blob1.png')
        blob2_path = os.path.join(assets_dir, 'blob2.png')
        food_path = os.path.join(assets_dir, 'food.png')
        trophy_path = os.path.join(assets_dir, 'trophy.png')

        # Load original images (will be scaled dynamically based on mass)
        self.blob1_image_original = pygame.image.load(blob1_path)
        self.blob2_image_original = pygame.image.load(blob2_path)
        self.food_image_original = pygame.image.load(food_path)

        # Load and scale trophy image
        trophy_image = pygame.image.load(trophy_path)
        self.trophy_image = pygame.transform.scale(trophy_image, (20, 20))  # Small trophy icons

        # Create small blob icons for win display
        self.blob1_icon = pygame.transform.scale(self.blob1_image_original, (24, 24))
        self.blob2_icon = pygame.transform.scale(self.blob2_image_original, (24, 24))

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

        # Food rotation animation
        self.food_rotation_speeds = {}  # Store rotation speed for each food position

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

    def draw_trophies(self, x, y, count, max_width):
        """
        Draw trophy icons in a flexbox-style grid layout

        Args:
            x: Starting x position
            y: Starting y position
            count: Number of trophies to draw
            max_width: Maximum width before wrapping to next row

        Returns:
            Height used by the trophy grid
        """
        if count == 0:
            return 0

        trophy_size = 20
        spacing = 5
        trophies_per_row = max((max_width - spacing) // (trophy_size + spacing), 1)

        rows = (count + trophies_per_row - 1) // trophies_per_row  # Ceiling division

        for i in range(count):
            row = i // trophies_per_row
            col = i % trophies_per_row

            trophy_x = x + col * (trophy_size + spacing)
            trophy_y = y + row * (trophy_size + spacing)

            self.screen.blit(self.trophy_image, (trophy_x, trophy_y))

        # Return total height used
        return rows * (trophy_size + spacing)

    def draw_food(self, pos):
        """Draw a food pellet using image sprite with rotation"""
        screen_pos = self.world_to_screen(pos)

        # Scale food image based on food radius (1.0 in world coordinates)
        # Make it 50% larger than the actual food collision radius for better visibility
        food_size = int(1.0 * self.scale * 3)  # Diameter (1.5x larger)
        food_size = max(8, food_size)  # Ensure minimum size

        # Scale the food image
        scaled_food = pygame.transform.scale(self.food_image_original, (food_size, food_size))

        # Calculate rotation angle based on position and time for varied rotation speeds
        # Use position as seed for deterministic but varied rotation speed
        pos_key = (round(pos[0], 1), round(pos[1], 1))  # Round to avoid floating point issues
        if pos_key not in self.food_rotation_speeds:
            # Assign a rotation speed between 30 and 120 degrees per second
            hash_val = hash(pos_key) % 1000 / 1000.0  # 0 to 1
            self.food_rotation_speeds[pos_key] = 30 + hash_val * 90

        rotation_speed = self.food_rotation_speeds[pos_key]
        current_time = pygame.time.get_ticks() / 1000.0
        rotation_angle = (current_time * rotation_speed) % 360

        # Rotate the scaled image
        rotated_food = pygame.transform.rotate(scaled_food, rotation_angle)

        # Get rect centered on the food position
        rect = rotated_food.get_rect(center=screen_pos)

        # Draw the food image
        self.screen.blit(rotated_food, rect)

    def draw_stats(self, env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins):
        """Draw statistics panel"""
        stats_x = self.game_offset_x + self.game_size + 30
        stats_y = self.game_offset_y
        stats_width = 250  # Width available for stats panel

        # Episode info
        title = self.font_large.render(f"Episode #{episode_num}", True, WHITE)
        self.screen.blit(title, (stats_x, stats_y))

        y_offset = stats_y + 50

        # Frame counter
        frame_text = self.font.render(f"Step: {env.steps}", True, WHITE)
        self.screen.blit(frame_text, (stats_x, y_offset))
        y_offset += 40

        # Win counters with trophy icons
        self.screen.blit(self.font.render("WINS", True, WHITE), (stats_x, y_offset))
        y_offset += 30

        # Blob 1 wins - show blob icon and count
        self.screen.blit(self.blob1_icon, (stats_x + 10, y_offset))
        wins_text = self.font.render(f"{blob1_wins}", True, LIGHT_BLUE)
        self.screen.blit(wins_text, (stats_x + 10 + 24 + 8, y_offset + 4))
        y_offset += 30
        if blob1_wins > 0:
            trophy_height = self.draw_trophies(stats_x + 10, y_offset, blob1_wins, stats_width - 20)
            y_offset += trophy_height + 10
        else:
            y_offset += 10

        # Blob 2 wins - show blob icon and count
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

        # Blob 1 (Blue) stats - show blob icon
        self.screen.blit(self.blob1_icon, (stats_x, y_offset))
        y_offset += 30
        self.screen.blit(self.font_small.render(f"Mass: {env.blob1_mass:.2f}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 25
        self.screen.blit(self.font_small.render(f"Foods: {blob1_foods}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 35

        # Blob 2 (Red) stats - show blob icon
        self.screen.blit(self.blob2_icon, (stats_x, y_offset))
        y_offset += 30
        self.screen.blit(self.font_small.render(f"Mass: {env.blob2_mass:.2f}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 25
        self.screen.blit(self.font_small.render(f"Foods: {blob2_foods}", True, WHITE), (stats_x + 10, y_offset))
        y_offset += 35

        # Status - show winning blob icon or status text
        if env.blob1_mass <= env.min_mass:
            # Blob 2 wins - show blob2 icon and "WINS!"
            self.screen.blit(self.blob2_icon, (stats_x, y_offset))
            status_text = self.font.render("WINS!", True, LIGHT_RED)
            self.screen.blit(status_text, (stats_x + 24 + 8, y_offset + 4))
        elif env.blob2_mass <= env.min_mass:
            # Blob 1 wins - show blob1 icon and "WINS!"
            self.screen.blit(self.blob1_icon, (stats_x, y_offset))
            status_text = self.font.render("WINS!", True, LIGHT_BLUE)
            self.screen.blit(status_text, (stats_x + 24 + 8, y_offset + 4))
        else:
            status_text = self.font.render("COMPETING...", True, GREEN)
            self.screen.blit(status_text, (stats_x, y_offset))

    def draw_controls(self):
        """Draw control instructions at bottom"""
        controls_y = self.height - 30
        controls = [
            "Controls: SPACE=Pause/Resume | R=Reset | Q/ESC=Quit"
        ]
        for i, text in enumerate(controls):
            surf = self.font_small.render(text, True, GRAY)
            self.screen.blit(surf, (self.game_offset_x, controls_y + i * 25))

    def render_frame(self, env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins):
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
        self.draw_stats(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins)

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


def live_demo(fps=30, fullscreen=False, max_foods=10):
    """
    Run live demo of competitive blob agents

    Args:
        fps: Frames per second for rendering
        fullscreen: Run in fullscreen mode
        max_foods: Maximum number of food pellets in the environment
    """
    # Load agents
    agent1_network, agent2_network, device = load_agents()
    if agent1_network is None or agent2_network is None:
        return

    # Create environment and renderer
    env = BlobCompeteEnv(max_foods=max_foods)
    renderer = LiveBlobRenderer(
        map_size=env.map_size,
        agent_radius=env.agent_radius,
        initial_mass=env.initial_mass,
        fullscreen=fullscreen
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

    print("\n" + "=" * 60)
    print("BLOB COMPETE - LIVE DEMO")
    print("=" * 60)
    print("\nControls:")
    print("  SPACE - Pause/Resume")
    print("  R     - Reset episode")
    print("  Q/ESC - Quit")
    print("=" * 60)
    print("\nStarting Episode 1...")

    running = True
    while running:
        # Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_q or event.key == pygame.K_ESCAPE:
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
                    renderer.food_rotation_speeds.clear()
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
                        blob1_wins += 1
                        print(f"\nEpisode {episode_num} ended! BLOB 1 WINS!")
                    elif winner == 2:
                        blob2_wins += 1
                        print(f"\nEpisode {episode_num} ended! BLOB 2 WINS!")
                    else:
                        print(f"\nEpisode {episode_num} ended! DRAW!")

                    print(f"  Steps: {env.steps}")
                    print(f"  Blob 1 foods: {blob1_foods}")
                    print(f"  Blob 2 foods: {blob2_foods}")
                    print(f"  Final masses: Blob1={env.blob1_mass:.2f}, Blob2={env.blob2_mass:.2f}")
                    print(f"  Win count: Blob1={blob1_wins}, Blob2={blob2_wins}")

                    # Auto-reset after brief pause
                    renderer.render_frame(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins)
                    pygame.time.wait(2000)  # Wait 2 seconds

                    episode_num += 1
                    (state1, state2), _ = env.reset()
                    done = False
                    blob1_foods = 0
                    blob2_foods = 0
                    renderer.blob1_animation_start = None
                    renderer.blob2_animation_start = None
                    renderer.food_rotation_speeds.clear()
                    print(f"\nStarting Episode {episode_num}...")

            # Render current state
            renderer.render_frame(env, episode_num, blob1_foods, blob2_foods, blob1_wins, blob2_wins)

        renderer.clock.tick(fps)

    renderer.close()
    print("\nDemo finished!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Live demo of competitive blob agents')
    parser.add_argument('--fps', type=int, default=30,
                       help='Frames per second (default: 30)')
    parser.add_argument('--fullscreen', action='store_true',
                       help='Run in fullscreen mode')
    parser.add_argument('--foods', type=int, default=10,
                       help='Maximum number of food pellets (default: 10)')

    args = parser.parse_args()

    live_demo(args.fps, args.fullscreen, args.foods)
