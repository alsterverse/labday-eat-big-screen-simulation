// Blob Compete Game using Phaser.js
let config = null;
let agent1 = null;
let agent2 = null;

async function loadGameAssets() {
    // Load configuration
    const configResponse = await fetch('env_config.json');
    config = await configResponse.json();

    // Load agent models
    agent1 = new DQN();
    agent2 = new DQN();
    await agent1.loadWeights('blob1_model.json');
    await agent2.loadWeights('blob2_model.json');
}

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        // Game state
        this.mapSize = config.map_size;
        this.agentRadius = config.agent_radius;
        this.initialMass = config.initial_mass;
        this.minMass = config.min_mass;
        this.massDecayRate = config.mass_decay_rate;
        this.massStealRate = config.mass_steal_rate;
        this.foodMassGain = config.food_mass_gain;
        this.movementSpeed = config.movement_speed;
        this.turnRate = config.turn_rate;
        this.maxFoods = config.max_foods;

        // Scale for rendering (game area is 1000x1000 px)
        this.gameSize = 1000;
        this.scale = this.gameSize / this.mapSize;

        // Stats panel width
        this.statsPanelWidth = 300;

        // Initialize game state
        this.resetEpisode();

        // Create graphics
        this.graphics = this.add.graphics();

        // Stats text
        this.statsText = this.add.text(this.gameSize + 20, 20, '', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#ffffff'
        });

        // Episode counter
        this.episodeNum = 1;
        this.blob1Wins = 0;
        this.blob2Wins = 0;

        // Update loop
        this.time.addEvent({
            delay: 33, // ~30 FPS
            callback: this.gameStep,
            callbackScope: this,
            loop: true
        });

        // Controls text
        this.controlsText = this.add.text(20, this.gameSize + 20,
            'Controls: SPACE=Pause | R=Reset | Built with Phaser.js', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#888888'
        });

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.input.keyboard.on('keydown-SPACE', () => {
            this.paused = !this.paused;
        });
        this.input.keyboard.on('keydown-R', () => {
            this.resetEpisode();
            this.episodeNum++;
        });

        this.paused = false;
    }

    resetEpisode() {
        // Initialize blob positions
        const margin = 20;
        this.blob1Pos = {
            x: margin + Math.random() * (this.mapSize - 2 * margin),
            y: margin + Math.random() * (this.mapSize - 2 * margin)
        };
        this.blob1Angle = Math.random() * Math.PI * 2;
        this.blob1Mass = this.initialMass;
        this.blob1FoodsCollected = 0;

        this.blob2Pos = {
            x: margin + Math.random() * (this.mapSize - 2 * margin),
            y: margin + Math.random() * (this.mapSize - 2 * margin)
        };
        this.blob2Angle = Math.random() * Math.PI * 2;
        this.blob2Mass = this.initialMass;
        this.blob2FoodsCollected = 0;

        // Generate food
        this.foods = [];
        for (let i = 0; i < this.maxFoods; i++) {
            this.spawnFood();
        }

        this.steps = 0;
        this.done = false;
    }

    spawnFood() {
        this.foods.push({
            x: Math.random() * this.mapSize,
            y: Math.random() * this.mapSize
        });
    }

    worldToScreen(pos) {
        return {
            x: pos.x * this.scale,
            y: pos.y * this.scale
        };
    }

    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getState(blobPos, blobAngle, blobMass, otherPos, otherMass) {
        // Find closest food
        let closestFoodDist = Infinity;
        let closestFoodAngle = 0;

        for (const food of this.foods) {
            const dist = this.distance(blobPos, food);
            if (dist < closestFoodDist) {
                closestFoodDist = dist;
                const dx = food.x - blobPos.x;
                const dy = food.y - blobPos.y;
                closestFoodAngle = Math.atan2(dy, dx) - blobAngle;
                closestFoodAngle = this.normalizeAngle(closestFoodAngle);
            }
        }

        // Distance and angle to other blob
        const distToOther = this.distance(blobPos, otherPos) / Math.sqrt(2 * this.mapSize * this.mapSize);
        const dx = otherPos.x - blobPos.x;
        const dy = otherPos.y - blobPos.y;
        let angleToOther = Math.atan2(dy, dx) - blobAngle;
        angleToOther = this.normalizeAngle(angleToOther);

        // State: [x, y, angle, mass, dist_to_other, angle_to_other, dist_to_food, angle_to_food]
        return [
            blobPos.x / this.mapSize,
            blobPos.y / this.mapSize,
            blobAngle,
            blobMass,
            distToOther,
            angleToOther,
            closestFoodDist / Math.sqrt(2 * this.mapSize * this.mapSize),
            closestFoodAngle
        ];
    }

    gameStep() {
        if (this.paused || this.done) {
            this.render();
            return;
        }

        // Get states
        const state1 = this.getState(this.blob1Pos, this.blob1Angle, this.blob1Mass, this.blob2Pos, this.blob2Mass);
        const state2 = this.getState(this.blob2Pos, this.blob2Angle, this.blob2Mass, this.blob1Pos, this.blob1Mass);

        // Get actions from agents
        const action1 = agent1.selectAction(state1);
        const action2 = agent2.selectAction(state2);

        // Update angles (0 = steer left, 1 = steer right)
        this.blob1Angle += (action1 === 0 ? -this.turnRate : this.turnRate);
        this.blob2Angle += (action2 === 0 ? -this.turnRate : this.turnRate);

        // Move blobs
        this.blob1Pos.x += Math.cos(this.blob1Angle) * this.movementSpeed;
        this.blob1Pos.y += Math.sin(this.blob1Angle) * this.movementSpeed;
        this.blob2Pos.x += Math.cos(this.blob2Angle) * this.movementSpeed;
        this.blob2Pos.y += Math.sin(this.blob2Angle) * this.movementSpeed;

        // Wrap around edges
        this.blob1Pos.x = (this.blob1Pos.x + this.mapSize) % this.mapSize;
        this.blob1Pos.y = (this.blob1Pos.y + this.mapSize) % this.mapSize;
        this.blob2Pos.x = (this.blob2Pos.x + this.mapSize) % this.mapSize;
        this.blob2Pos.y = (this.blob2Pos.y + this.mapSize) % this.mapSize;

        // Decay mass
        this.blob1Mass -= this.massDecayRate;
        this.blob2Mass -= this.massDecayRate;

        // Check food collision
        for (let i = this.foods.length - 1; i >= 0; i--) {
            const food = this.foods[i];
            const dist1 = this.distance(this.blob1Pos, food);
            const dist2 = this.distance(this.blob2Pos, food);

            if (dist1 < this.agentRadius) {
                this.blob1Mass += this.foodMassGain;
                this.blob1FoodsCollected++;
                this.foods.splice(i, 1);
                this.spawnFood();
            } else if (dist2 < this.agentRadius) {
                this.blob2Mass += this.foodMassGain;
                this.blob2FoodsCollected++;
                this.foods.splice(i, 1);
                this.spawnFood();
            }
        }

        // Check blob collision
        const distBetweenBlobs = this.distance(this.blob1Pos, this.blob2Pos);
        if (distBetweenBlobs < this.agentRadius * 2) {
            // Mass transfer
            if (this.blob1Mass > this.blob2Mass) {
                const stolen = this.massStealRate;
                this.blob1Mass += stolen;
                this.blob2Mass -= stolen;
            } else if (this.blob2Mass > this.blob1Mass) {
                const stolen = this.massStealRate;
                this.blob2Mass += stolen;
                this.blob1Mass -= stolen;
            }
        }

        // Check for episode end
        if (this.blob1Mass <= this.minMass || this.blob2Mass <= this.minMass) {
            this.done = true;
            if (this.blob1Mass > this.blob2Mass) {
                this.blob1Wins++;
            } else if (this.blob2Mass > this.blob1Mass) {
                this.blob2Wins++;
            }

            // Auto-reset after 2 seconds
            this.time.delayedCall(2000, () => {
                this.episodeNum++;
                this.resetEpisode();
            });
        }

        this.steps++;
        this.render();
    }

    render() {
        this.graphics.clear();

        // Draw game border
        this.graphics.lineStyle(2, 0x555555);
        this.graphics.strokeRect(0, 0, this.gameSize, this.gameSize);

        // Draw food
        for (const food of this.foods) {
            const screenPos = this.worldToScreen(food);
            this.graphics.fillStyle(0x00FF00, 1);
            this.graphics.fillCircle(screenPos.x, screenPos.y, 5);
        }

        // Draw blobs
        const blob1ScreenPos = this.worldToScreen(this.blob1Pos);
        const blob1Radius = this.agentRadius * this.scale * (this.blob1Mass / this.initialMass);
        this.graphics.fillStyle(0x5078DC, 1);
        this.graphics.fillCircle(blob1ScreenPos.x, blob1ScreenPos.y, blob1Radius);

        // Draw direction indicator for blob1
        this.graphics.lineStyle(2, 0xFFFFFF);
        this.graphics.beginPath();
        this.graphics.moveTo(blob1ScreenPos.x, blob1ScreenPos.y);
        this.graphics.lineTo(
            blob1ScreenPos.x + Math.cos(this.blob1Angle) * blob1Radius * 1.5,
            blob1ScreenPos.y + Math.sin(this.blob1Angle) * blob1Radius * 1.5
        );
        this.graphics.strokePath();

        const blob2ScreenPos = this.worldToScreen(this.blob2Pos);
        const blob2Radius = this.agentRadius * this.scale * (this.blob2Mass / this.initialMass);
        this.graphics.fillStyle(0xDC3232, 1);
        this.graphics.fillCircle(blob2ScreenPos.x, blob2ScreenPos.y, blob2Radius);

        // Draw direction indicator for blob2
        this.graphics.lineStyle(2, 0xFFFFFF);
        this.graphics.beginPath();
        this.graphics.moveTo(blob2ScreenPos.x, blob2ScreenPos.y);
        this.graphics.lineTo(
            blob2ScreenPos.x + Math.cos(this.blob2Angle) * blob2Radius * 1.5,
            blob2ScreenPos.y + Math.sin(this.blob2Angle) * blob2Radius * 1.5
        );
        this.graphics.strokePath();

        // Update stats text
        const status = this.done ?
            (this.blob1Mass > this.blob2Mass ? 'BLOB 1 WINS!' :
             this.blob2Mass > this.blob1Mass ? 'BLOB 2 WINS!' : 'DRAW!') :
            'COMPETING...';

        this.statsText.setText([
            `Episode #${this.episodeNum}`,
            '',
            `Step: ${this.steps}`,
            '',
            'WINS',
            `🔵 Blob 1: ${this.blob1Wins}`,
            `🔴 Blob 2: ${this.blob2Wins}`,
            '',
            '🔵 Blob 1',
            `  Mass: ${this.blob1Mass.toFixed(2)}`,
            `  Foods: ${this.blob1FoodsCollected}`,
            '',
            '🔴 Blob 2',
            `  Mass: ${this.blob2Mass.toFixed(2)}`,
            `  Foods: ${this.blob2FoodsCollected}`,
            '',
            status
        ]);
    }
}

const gameConfig = {
    type: Phaser.AUTO,
    width: 1300,
    height: 1050,
    parent: 'game-container',
    backgroundColor: '#000000',
    scene: GameScene
};

// Load assets first, then start the game
loadGameAssets().then(() => {
    console.log('Assets loaded, starting game...');
    const game = new Phaser.Game(gameConfig);
}).catch(err => {
    console.error('Failed to load game assets:', err);
    document.body.innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Error loading game. Check console.</div>';
});
