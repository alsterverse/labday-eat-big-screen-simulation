/**
 * Particle system for explosion effects.
 */

export class Particle {
    constructor(x, y, vx, vy, color, size, lifetime) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.initialSize = size;
        this.size = size;
        this.lifetime = lifetime;
        this.age = 0;
        this.alpha = 1;
    }

    update(dt) {
        // Gravity
        this.vy += 150 * dt;

        // Movement
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Air resistance
        this.vx *= 0.98;
        this.vy *= 0.98;

        // Age
        this.age += dt;
        const progress = this.age / this.lifetime;

        // Fade and shrink
        this.alpha = 1 - progress;
        this.size = this.initialSize * (1 - progress * 0.5);
    }

    isAlive() {
        return this.age < this.lifetime;
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    createExplosion(x, y, mass, colorType) {
        const numParticles = Math.min(150, Math.floor(30 + mass * 5));

        const colors = colorType === 'blue'
            ? ['#3278dc', '#96c8ff', '#ffffff', '#6496ff']
            : ['#dc3232', '#ff9696', '#ffffff', '#ff6464'];

        for (let i = 0; i < numParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 150;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 2 + Math.random() * 4;
            const lifetime = 0.5 + Math.random();

            this.particles.push(new Particle(x, y, vx, vy, color, size, lifetime));
        }
    }

    update(dt) {
        for (const particle of this.particles) {
            particle.update(dt);
        }
        this.particles = this.particles.filter(p => p.isAlive());
    }

    draw(ctx) {
        for (const particle of this.particles) {
            ctx.save();
            ctx.globalAlpha = particle.alpha;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}
