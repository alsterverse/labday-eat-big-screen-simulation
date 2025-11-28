/**
 * Canvas renderer for the game.
 */

export class Renderer {
    constructor(canvas, env) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.env = env;

        // Layout
        this.width = 1200;
        this.height = 800;
        this.gameSize = Math.min(this.width - 300, this.height - 100);
        this.gameOffsetX = 50;
        this.gameOffsetY = 50;
        this.scale = this.gameSize / env.mapSize;

        canvas.width = this.width;
        canvas.height = this.height;

        // Assets
        this.assets = {};
        this.assetsLoaded = false;

        // Animation state
        this.blob1AnimStart = null;
        this.blob2AnimStart = null;
        this.animDuration = 0.4;
        this.foodRotationSpeeds = new Map();

        // Audio
        this.eatSound = null;
        this.eatSound2 = null;
    }

    async loadAssets() {
        const loadImage = (src) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });
        };

        const loadAudio = (src) => {
            return new Promise((resolve) => {
                const audio = new Audio(src);
                audio.volume = 0.5;
                resolve(audio);
            });
        };

        try {
            [
                this.assets.blob1,
                this.assets.blob2,
                this.assets.food,
                this.assets.trophy,
                this.eatSound,
                this.eatSound2
            ] = await Promise.all([
                loadImage('assets/blob1.png'),
                loadImage('assets/blob2.png'),
                loadImage('assets/food.png'),
                loadImage('assets/trophy.png'),
                loadAudio('assets/eat1.ogg'),
                loadAudio('assets/eat2.ogg')
            ]);
            this.assetsLoaded = true;
        } catch (e) {
            console.warn('Failed to load some assets:', e);
            this.assetsLoaded = true; // Continue anyway
        }
    }

    worldToScreen(x, y) {
        return {
            x: this.gameOffsetX + x * this.scale,
            y: this.gameOffsetY + y * this.scale
        };
    }

    bounceCurve(t) {
        if (t >= 1) return 1;
        const amplitude = 0.15;
        const bounceFactor = 2;
        return 1 + amplitude * Math.exp(-bounceFactor * t) * Math.cos(2 * Math.PI * bounceFactor * t);
    }

    getAnimScale(blobId, now) {
        const startTime = blobId === 1 ? this.blob1AnimStart : this.blob2AnimStart;
        if (startTime === null) return 1;

        const elapsed = now - startTime;
        if (elapsed < this.animDuration) {
            return this.bounceCurve(elapsed / this.animDuration);
        } else {
            if (blobId === 1) this.blob1AnimStart = null;
            else this.blob2AnimStart = null;
            return 1;
        }
    }

    triggerFoodAnim(blobId, now) {
        if (blobId === 1) this.blob1AnimStart = now;
        else this.blob2AnimStart = now;

        // Play sound
        try {
            const sound = Math.random() < 0.2 ? this.eatSound2 : this.eatSound;
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(() => {});
            }
        } catch (e) {}
    }

    drawBlob(blob, blobId, hue, now) {
        const pos = this.worldToScreen(blob.x, blob.y);
        const img = hue === 'blue' ? this.assets.blob1 : this.assets.blob2;
        if (!img) return;

        const baseSize = this.env.agentRadius * this.scale * 2;
        const massScale = blob.mass / this.env.initialMass;
        const animScale = this.getAnimScale(blobId, now);
        const size = Math.max(10, baseSize * massScale * animScale);

        const facingLeft = Math.abs(blob.angle) > Math.PI / 2;
        let angleDeg = facingLeft ? blob.angle * 180 / Math.PI : -blob.angle * 180 / Math.PI;

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        this.ctx.rotate(angleDeg * Math.PI / 180);
        if (facingLeft) this.ctx.scale(1, -1);
        this.ctx.drawImage(img, -size / 2, -size / 2, size, size);
        this.ctx.restore();
    }

    drawFood(food, now) {
        const pos = this.worldToScreen(food.x, food.y);
        const img = this.assets.food;
        if (!img) return;

        const size = Math.max(8, this.scale * 3);

        // Get rotation speed for this food
        const key = `${food.x.toFixed(1)},${food.y.toFixed(1)}`;
        if (!this.foodRotationSpeeds.has(key)) {
            this.foodRotationSpeeds.set(key, 30 + Math.random() * 90);
        }
        const rotSpeed = this.foodRotationSpeeds.get(key);
        const angle = (now * rotSpeed) % 360;

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        this.ctx.rotate(angle * Math.PI / 180);
        this.ctx.drawImage(img, -size / 2, -size / 2, size, size);
        this.ctx.restore();
    }

    drawStats(episodeNum, blob1Wins, blob2Wins, now) {
        const statsX = this.gameOffsetX + this.gameSize + 30;
        let y = this.gameOffsetY;

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 28px Arial';
        this.ctx.fillText(`Episode #${episodeNum}`, statsX, y + 24);
        y += 50;

        this.ctx.font = '20px Arial';
        this.ctx.fillText(`Step: ${this.env.steps}`, statsX, y + 16);
        y += 40;

        this.ctx.fillText('WINS', statsX, y + 16);
        y += 30;

        // Blob 1 wins
        if (this.assets.blob1) {
            this.ctx.drawImage(this.assets.blob1, statsX + 10, y, 24, 24);
        }
        this.ctx.fillStyle = '#96c8ff';
        this.ctx.fillText(`${blob1Wins}`, statsX + 42, y + 18);
        y += 40;

        // Draw trophies for blob1
        if (blob1Wins > 0 && this.assets.trophy) {
            for (let i = 0; i < Math.min(blob1Wins, 10); i++) {
                this.ctx.drawImage(this.assets.trophy, statsX + 10 + (i % 5) * 25, y + Math.floor(i / 5) * 25, 20, 20);
            }
            y += Math.ceil(Math.min(blob1Wins, 10) / 5) * 25 + 10;
        }

        // Blob 2 wins
        this.ctx.fillStyle = '#ffffff';
        if (this.assets.blob2) {
            this.ctx.drawImage(this.assets.blob2, statsX + 10, y, 24, 24);
        }
        this.ctx.fillStyle = '#ff9696';
        this.ctx.fillText(`${blob2Wins}`, statsX + 42, y + 18);
        y += 40;

        // Draw trophies for blob2
        if (blob2Wins > 0 && this.assets.trophy) {
            for (let i = 0; i < Math.min(blob2Wins, 10); i++) {
                this.ctx.drawImage(this.assets.trophy, statsX + 10 + (i % 5) * 25, y + Math.floor(i / 5) * 25, 20, 20);
            }
            y += Math.ceil(Math.min(blob2Wins, 10) / 5) * 25 + 10;
        }

        y += 20;

        // Blob 1 stats
        this.ctx.fillStyle = '#ffffff';
        if (this.assets.blob1) {
            this.ctx.drawImage(this.assets.blob1, statsX, y, 24, 24);
        }
        y += 30;
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Mass: ${this.env.blob1.mass.toFixed(2)}`, statsX + 10, y + 12);
        y += 25;
        this.ctx.fillText(`Foods: ${this.env.blob1.foodsCollected}`, statsX + 10, y + 12);
        y += 35;

        // Blob 2 stats
        if (this.assets.blob2) {
            this.ctx.drawImage(this.assets.blob2, statsX, y, 24, 24);
        }
        y += 30;
        this.ctx.fillText(`Mass: ${this.env.blob2.mass.toFixed(2)}`, statsX + 10, y + 12);
        y += 25;
        this.ctx.fillText(`Foods: ${this.env.blob2.foodsCollected}`, statsX + 10, y + 12);
        y += 35;

        // Status
        this.ctx.font = '20px Arial';
        if (this.env.blob1.mass <= this.env.minMass) {
            if (this.assets.blob2) this.ctx.drawImage(this.assets.blob2, statsX, y, 24, 24);
            this.ctx.fillStyle = '#ff9696';
            this.ctx.fillText('WINS!', statsX + 32, y + 18);
        } else if (this.env.blob2.mass <= this.env.minMass) {
            if (this.assets.blob1) this.ctx.drawImage(this.assets.blob1, statsX, y, 24, 24);
            this.ctx.fillStyle = '#96c8ff';
            this.ctx.fillText('WINS!', statsX + 32, y + 18);
        } else {
            this.ctx.fillStyle = '#32dc32';
            this.ctx.fillText('COMPETING...', statsX, y + 18);
        }
    }

    render(particleSystem, episodeNum, blob1Wins, blob2Wins, now) {
        const ctx = this.ctx;

        // Clear
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.width, this.height);

        // Game area border
        ctx.strokeStyle = '#646464';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.gameOffsetX, this.gameOffsetY, this.gameSize, this.gameSize);

        // Foods
        for (const food of this.env.foods) {
            this.drawFood(food, now);
        }

        // Blobs
        this.drawBlob(this.env.blob1, 1, 'blue', now);
        this.drawBlob(this.env.blob2, 2, 'red', now);

        // Particles
        particleSystem.draw(ctx);

        // Stats
        this.drawStats(episodeNum, blob1Wins, blob2Wins, now);
    }

    clearFoodRotations() {
        this.foodRotationSpeeds.clear();
    }
}
