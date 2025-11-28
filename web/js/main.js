/**
 * Main game entry point.
 */

import { NeuralNetwork } from './neural.js';
import { BlobEnvironment } from './environment.js';
import { ParticleSystem } from './particles.js';
import { Renderer } from './renderer.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.loading = document.getElementById('loading');

        this.agent1 = new NeuralNetwork();
        this.agent2 = new NeuralNetwork();
        this.env = new BlobEnvironment({ maxFoods: 10 });
        this.renderer = new Renderer(this.canvas, this.env);
        this.particles = new ParticleSystem();

        this.episodeNum = 1;
        this.blob1Wins = 0;
        this.blob2Wins = 0;
        this.blob1Alive = true;
        this.blob2Alive = true;
        this.paused = false;
        this.done = false;

        this.state1 = null;
        this.state2 = null;
        this.lastTime = 0;

        this.setupControls();
    }

    async init() {
        // Load neural network weights
        await Promise.all([
            this.agent1.loadWeights('models/blob1_weights.json'),
            this.agent2.loadWeights('models/blob2_weights.json')
        ]);

        // Load renderer assets
        await this.renderer.loadAssets();

        // Hide loading
        this.loading.style.display = 'none';

        // Reset environment
        this.resetEpisode();

        // Start game loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    setupControls() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.paused = !this.paused;
            } else if (e.code === 'KeyR') {
                this.episodeNum++;
                this.resetEpisode();
            }
        });
    }

    resetEpisode() {
        [this.state1, this.state2] = this.env.reset();
        this.done = false;
        this.blob1Alive = true;
        this.blob2Alive = true;
        this.renderer.blob1AnimStart = null;
        this.renderer.blob2AnimStart = null;
        this.renderer.clearFoodRotations();
        this.particles.particles = [];
    }

    gameLoop(timestamp) {
        const dt = this.lastTime ? (timestamp - this.lastTime) / 1000 : 0;
        this.lastTime = timestamp;
        const now = timestamp / 1000;

        if (!this.paused) {
            this.particles.update(dt);

            if (!this.done) {
                // Get actions from neural networks
                const action1 = this.agent1.selectAction(this.state1);
                const action2 = this.agent2.selectAction(this.state2);

                // Step environment
                const result = this.env.step(action1, action2);

                // Update states
                [this.state1, this.state2] = result.observations;

                // Handle food collection animations
                if (result.blob1Ate) {
                    this.renderer.triggerFoodAnim(1, now);
                }
                if (result.blob2Ate) {
                    this.renderer.triggerFoodAnim(2, now);
                }

                // Handle death explosions
                if (this.blob1Alive && this.env.blob1.mass <= this.env.minMass) {
                    const pos = this.renderer.worldToScreen(this.env.blob1.x, this.env.blob1.y);
                    this.particles.createExplosion(pos.x, pos.y, this.env.blob1.mass, 'blue');
                    this.blob1Alive = false;
                }
                if (this.blob2Alive && this.env.blob2.mass <= this.env.minMass) {
                    const pos = this.renderer.worldToScreen(this.env.blob2.x, this.env.blob2.y);
                    this.particles.createExplosion(pos.x, pos.y, this.env.blob2.mass, 'red');
                    this.blob2Alive = false;
                }

                // Check for episode end
                if (result.terminated || result.truncated) {
                    this.done = true;
                    if (result.winner === 1) this.blob1Wins++;
                    else if (result.winner === 2) this.blob2Wins++;

                    // Auto-reset after delay
                    setTimeout(() => {
                        this.episodeNum++;
                        this.resetEpisode();
                    }, 2000);
                }
            }
        }

        // Render
        this.renderer.render(this.particles, this.episodeNum, this.blob1Wins, this.blob2Wins, now);

        requestAnimationFrame((t) => this.gameLoop(t));
    }
}

// Start the game
const game = new Game();
game.init().catch(console.error);
