"""
Interactive CartPole Demo - Click to disturb the pole!

This script allows you to test the robustness of the trained DQN agent
by clicking on the window to apply disturbances to the pole.

Controls:
- Click LEFT side of window: Push pole to the left
- Click RIGHT side of window: Push pole to the right
- Press ESC or close window: Exit
"""

import gymnasium as gym
import torch
import numpy as np
import pygame
from dqn_cartpole import DQN


def interactive_demo(model_path='dqn_cartpole_model.pth', disturbance_strength=0.4):
    """
    Interactive demo where user can click to disturb the pole.

    Args:
        model_path: Path to the saved model weights
        disturbance_strength: Strength of disturbance in radians (default: 0.4)
    """
    # Create environment with rendering
    env = gym.make("CartPole-v1", render_mode="human")

    # Increase the angle threshold to allow more recovery time
    # Default is ~12 degrees (0.2095 rad), we're changing to 90 degrees (1.57 rad)
    env.unwrapped.theta_threshold_radians = 1.57  # 90 degrees (π/2 radians)

    state_size = env.observation_space.shape[0]
    action_size = env.action_space.n

    # Load the trained model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = DQN(state_size, action_size).to(device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()

    print("=" * 70)
    print("INTERACTIVE CARTPOLE DEMO - Test Agent Robustness!")
    print("=" * 70)
    print("\nControls:")
    print("  • Click LEFT side of window  → Push pole LEFT")
    print("  • Click RIGHT side of window → Push pole RIGHT")
    print("  • Press ESC or close window  → Exit")
    print(f"\nDisturbance strength: {disturbance_strength:.2f} radians")
    print(f"Pole angle limit: 90 degrees (1.57 radians)")
    print("\nThe agent will try to recover from your disturbances!")
    print("The pole can now tilt much further before falling!")
    print("If the pole falls, the simulation will automatically restart.")
    print("-" * 70)
    print()

    # Track overall statistics
    total_disturbances = 0
    total_episodes = 0
    running = True

    print("Interactive session started - Click anywhere to disturb the pole!\n")

    while running:
        # Start/restart episode
        total_episodes += 1
        state, _ = env.reset()
        episode_reward = 0
        episode_steps = 0
        episode_disturbances = 0

        if total_episodes > 1:
            print(f"\n🔄 Episode {total_episodes} started - Pole reset!\n")

        while running:
            # Render the environment to update the pygame window
            env.render()

            # Check for pygame events (mouse clicks, keyboard, window close)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    print("\nWindow closed. Exiting...")
                    running = False
                    break

                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        print("\nESC pressed. Exiting...")
                        running = False
                        break

                elif event.type == pygame.MOUSEBUTTONDOWN:
                    # Get click position
                    mouse_x, mouse_y = pygame.mouse.get_pos()

                    # Get window dimensions
                    # CartPole-v1 default window is 600x400
                    window_width = env.unwrapped.screen_dim if hasattr(env.unwrapped, 'screen_dim') else 600
                    if isinstance(window_width, tuple):
                        window_width = window_width[0]

                    # Determine click side
                    click_side = "LEFT" if mouse_x < window_width / 2 else "RIGHT"

                    # Apply disturbance to pole angular velocity (not angle directly)
                    # state: [cart_pos, cart_vel, pole_angle, pole_angular_vel]
                    current_state = env.unwrapped.state

                    if click_side == "LEFT":
                        # Push pole to the left (positive angular velocity)
                        angular_impulse = disturbance_strength * 2
                    else:
                        # Push pole to the right (negative angular velocity)
                        angular_impulse = -disturbance_strength * 2

                    # Modify ONLY the angular velocity (not the angle)
                    # This applies an impulse force that the physics engine naturally integrates
                    new_state = list(current_state)
                    new_state[3] += angular_impulse  # Add angular velocity impulse

                    # Update the environment state
                    env.unwrapped.state = tuple(new_state)

                    total_disturbances += 1
                    episode_disturbances += 1

                    print(f"  💥 Disturbance #{total_disturbances}: Pushed pole {click_side} "
                          f"(angular velocity: {current_state[3]:.3f} → {new_state[3]:.3f} rad/s)")

            if not running:
                break

            # Agent selects action based on current state
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0).to(device)
                q_values = model(state_tensor)
                action = q_values.argmax().item()

            # Execute action
            state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            episode_reward += reward
            episode_steps += 1

            # If pole falls, print message and restart episode
            if done:
                print(f"\n❌ Pole fell! Episode {total_episodes} stats: {episode_steps} steps, {episode_disturbances} disturbance(s)")
                break  # Exit inner loop to restart episode

    env.close()

    print()
    print("=" * 70)
    print("DEMO COMPLETE")
    print("=" * 70)
    print(f"Total episodes: {total_episodes}")
    print(f"Total disturbances applied: {total_disturbances}")
    print("\nThe trained agent tried its best to recover from your disturbances!")
    print("=" * 70)


if __name__ == "__main__":
    interactive_demo(
        model_path='dqn_cartpole_model.pth',
        disturbance_strength=0.4  # Medium push (0.3-0.5 radians)
    )
