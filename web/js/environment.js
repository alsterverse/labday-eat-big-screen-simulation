/**
 * Game environment - handles physics and game logic.
 * Port of SimpleBlobEnv from Python.
 */

export class BlobEnvironment {
    constructor(config = {}) {
        this.mapSize = config.mapSize || 100.0;
        this.initialMass = config.initialMass || 5.0;
        this.massDecayRate = config.massDecayRate || 0.05;
        this.movementSpeed = config.movementSpeed || 1.2;
        this.turnRate = config.turnRate || 0.12;
        this.foodMassGain = config.foodMassGain || 1.5;
        this.minMass = config.minMass || 0.5;
        this.maxFoods = config.maxFoods || 10;
        this.agentRadius = config.agentRadius || 2.5;
        this.maxSteps = config.maxSteps || 2000;

        this.reset();
    }

    reset() {
        // Blob 1
        this.blob1 = {
            x: this.randomRange(10, this.mapSize - 10),
            y: this.randomRange(10, this.mapSize - 10),
            angle: this.randomRange(-Math.PI, Math.PI),
            mass: this.initialMass,
            foodsCollected: 0
        };

        // Blob 2 - ensure far from blob 1
        do {
            this.blob2 = {
                x: this.randomRange(10, this.mapSize - 10),
                y: this.randomRange(10, this.mapSize - 10),
                angle: this.randomRange(-Math.PI, Math.PI),
                mass: this.initialMass,
                foodsCollected: 0
            };
        } while (this.distance(this.blob1, this.blob2) < this.mapSize / 3);

        // Food pellets
        this.foods = [];
        for (let i = 0; i < this.maxFoods; i++) {
            this.foods.push(this.spawnFood());
        }

        this.steps = 0;

        return [this.getObservation(1), this.getObservation(2)];
    }

    spawnFood() {
        return {
            x: this.randomRange(5, this.mapSize - 5),
            y: this.randomRange(5, this.mapSize - 5)
        };
    }

    randomRange(min, max) {
        return min + Math.random() * (max - min);
    }

    distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    normalizeAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    step(action1, action2) {
        this.steps++;

        // Apply steering
        if (action1 === 0) {
            this.blob1.angle += this.turnRate;
        } else {
            this.blob1.angle -= this.turnRate;
        }
        this.blob1.angle = this.normalizeAngle(this.blob1.angle);

        if (action2 === 0) {
            this.blob2.angle += this.turnRate;
        } else {
            this.blob2.angle -= this.turnRate;
        }
        this.blob2.angle = this.normalizeAngle(this.blob2.angle);

        // Move forward
        this.blob1.x += this.movementSpeed * Math.cos(this.blob1.angle);
        this.blob1.y += this.movementSpeed * Math.sin(this.blob1.angle);
        this.blob2.x += this.movementSpeed * Math.cos(this.blob2.angle);
        this.blob2.y += this.movementSpeed * Math.sin(this.blob2.angle);

        // Wrap around boundaries
        this.blob1.x = ((this.blob1.x % this.mapSize) + this.mapSize) % this.mapSize;
        this.blob1.y = ((this.blob1.y % this.mapSize) + this.mapSize) % this.mapSize;
        this.blob2.x = ((this.blob2.x % this.mapSize) + this.mapSize) % this.mapSize;
        this.blob2.y = ((this.blob2.y % this.mapSize) + this.mapSize) % this.mapSize;

        // Decay mass
        this.blob1.mass -= this.massDecayRate;
        this.blob2.mass -= this.massDecayRate;

        // Check food collection
        let blob1Ate = false;
        let blob2Ate = false;
        const foodsToRemove = [];

        for (let i = 0; i < this.foods.length; i++) {
            const food = this.foods[i];
            const dist1 = this.distance(this.blob1, food);
            const dist2 = this.distance(this.blob2, food);

            if (dist1 < this.agentRadius + 1.0) {
                this.blob1.mass += this.foodMassGain;
                this.blob1.foodsCollected++;
                foodsToRemove.push(i);
                blob1Ate = true;
            } else if (dist2 < this.agentRadius + 1.0) {
                this.blob2.mass += this.foodMassGain;
                this.blob2.foodsCollected++;
                foodsToRemove.push(i);
                blob2Ate = true;
            }
        }

        // Remove collected foods (reverse order)
        for (let i = foodsToRemove.length - 1; i >= 0; i--) {
            this.foods.splice(foodsToRemove[i], 1);
        }

        // Respawn foods
        while (this.foods.length < this.maxFoods) {
            this.foods.push(this.spawnFood());
        }

        // Check termination
        const blob1Dead = this.blob1.mass <= this.minMass;
        const blob2Dead = this.blob2.mass <= this.minMass;
        const terminated = blob1Dead || blob2Dead;
        const truncated = this.steps >= this.maxSteps;

        let winner = 0;
        if (blob2Dead && !blob1Dead) winner = 1;
        else if (blob1Dead && !blob2Dead) winner = 2;

        return {
            observations: [this.getObservation(1), this.getObservation(2)],
            terminated,
            truncated,
            winner,
            blob1Ate,
            blob2Ate
        };
    }

    getObservation(blobId) {
        const myBlob = blobId === 1 ? this.blob1 : this.blob2;
        const otherBlob = blobId === 1 ? this.blob2 : this.blob1;

        // Distance and angle to other blob
        const dx = otherBlob.x - myBlob.x;
        const dy = otherBlob.y - myBlob.y;
        const distToOther = Math.sqrt(dx * dx + dy * dy);
        const angleToOther = Math.atan2(dy, dx);
        const relAngleToOther = this.normalizeAngle(angleToOther - myBlob.angle);

        const maxDist = Math.sqrt(2) * this.mapSize;
        const normDistToOther = distToOther / maxDist;

        // Find closest food
        let closestFoodDist = Infinity;
        let closestFood = null;

        for (const food of this.foods) {
            const d = this.distance(myBlob, food);
            if (d < closestFoodDist) {
                closestFoodDist = d;
                closestFood = food;
            }
        }

        let relAngleToFood = 0;
        let normDistToFood = 1;

        if (closestFood) {
            const fdx = closestFood.x - myBlob.x;
            const fdy = closestFood.y - myBlob.y;
            const angleToFood = Math.atan2(fdy, fdx);
            relAngleToFood = this.normalizeAngle(angleToFood - myBlob.angle);
            normDistToFood = closestFoodDist / maxDist;
        }

        return [
            myBlob.x / this.mapSize,
            myBlob.y / this.mapSize,
            myBlob.angle,
            myBlob.mass / 10.0,
            normDistToOther,
            relAngleToOther,
            normDistToFood,
            relAngleToFood
        ];
    }
}
