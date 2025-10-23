# Blob Harvest - DQN Training Prototype

A reinforcement learning project where a blob agent learns to survive by collecting food pellets. The agent uses Deep Q-Learning (DQN) to learn optimal navigation and food collection strategies.

## Game Mechanics

- **Agent**: A circular blob that constantly moves forward
- **Controls**: Steer left or right
- **Physics**:
  - Agent has constant radius (2.5 units, independent of mass)
  - Mass decays each step (0.08 per step)
  - Collecting food increases mass (+2.0 per food)
  - Episode ends when mass drops below minimum threshold (0.5)
- **Objective**: Survive as long as possible by collecting food

## Episode Length Progression

The episode length naturally emerges from the game physics:
- **Untrained agent**: ~56 steps (baseline survival without finding food)
- **Trained agent**: 100-200+ steps (efficiently navigates to food)

Without collecting any food, an agent starts with 5.0 mass and loses 0.08 per step, surviving approximately 56 steps before reaching the minimum mass of 0.5.

## State Space

The agent observes 6 features:
1. Agent X position (normalized)
2. Agent Y position (normalized)
3. Agent angle (radians)
4. **Relative angle to food** (radians, -π to π) - tells agent which direction to turn
5. **Distance to food** (normalized) - tells agent how far the closest food is
6. Agent mass (normalized)

The relative angle and distance features provide direct actionable information, making it much easier for the agent to learn efficient food-seeking behavior.

## Action Space

Two discrete actions:
- 0: Steer left
- 1: Steer right

## Files

- `blob_env.py`: Custom Gymnasium environment implementing blob physics
- `train_blob.py`: DQN training script
- `demo_blob.py`: Real-time visualization of trained agent
- `blob_model.pth`: Trained model weights (generated after training)
- `training_results.png`: Training metrics plots (generated after training)

## Usage

### Train the agent:
```bash
python blob_harvest/train_blob.py
```

Training runs for 800 episodes and generates:
- `blob_model.pth`: Trained model weights
- `training_results.png`: Plots showing episode length, rewards, foods collected, and loss

### Watch the trained agent:
```bash
python blob_harvest/demo_blob.py
```

The visualization shows:
- **Green blob**: Normal mass
- **Orange blob**: Low mass (danger!)
- **Cyan blob**: High mass
- **Red circles**: Food pellets
- **White arrow**: Direction of movement

## Environment Parameters

Default parameters:
- Map size: 100x100
- Initial mass: 5.0
- Agent radius: 2.5 (constant, independent of mass)
- Mass decay rate: 0.08 per step
- Movement speed: 1.2 units per step
- Turn rate: 0.12 radians per action
- Food mass gain: 2.0
- Minimum mass: 0.5
- Number of food pellets: 8
- Natural survival without food: ~56 steps

## DQN Architecture

- Input layer: 6 features
- Hidden layers: 2x 128 neurons with ReLU activation
- Output layer: 2 Q-values (one per action)
- Optimizer: Adam (lr=0.001)
- Replay buffer: 50,000 experiences
- Target network update: Every 10 episodes
- Epsilon decay: 0.995 per episode (1.0 → 0.01)

## Training Improvements

Several key improvements were made to achieve stable learning:

1. **Enhanced State Representation**: Added relative angle to food and distance to food features, giving the agent direct actionable information about where to steer
2. **Reward Shaping**: Small continuous rewards for moving toward food (+/-0.02 per distance unit) help guide the agent toward correct behavior
3. **Balanced Exploration**: Epsilon decay rate of 0.995 provides good balance between early exploration and later exploitation

These improvements resulted in agents that consistently survive 50-100+ steps (vs ~25 steps untrained) and achieve peak performance of 100-200 steps with efficient food collection.

## Dependencies

- Python 3.7+
- PyTorch
- Gymnasium
- NumPy
- Matplotlib
