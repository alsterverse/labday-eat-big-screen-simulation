/**
 * Basic Shapes Colorful Graphics Mode
 * Geometric shapes rendering - circles for food, arrows for blobs
 */

const BasicShapesColorfulMode = {
  id: "basicShapesColorful",
  name: "Basic Shapes (Colorful)",

  // Color palettes
  foodColors: [
    [255, 100, 100, 1.0], // Red
    [100, 255, 100, 1.0], // Green
    [100, 100, 255, 1.0], // Blue
    [255, 255, 100, 1.0], // Yellow
    [255, 100, 255, 1.0], // Magenta
    [100, 255, 255, 1.0], // Cyan
    [255, 180, 100, 1.0], // Orange
    [180, 100, 255, 1.0], // Purple
  ],

  blobColors: [
    [66, 135, 245, 1.0], // Blue
    [245, 66, 66, 1.0], // Red
    [66, 245, 135, 1.0], // Green
    [245, 200, 66, 1.0], // Orange
    [200, 66, 245, 1.0], // Purple
    [66, 220, 245, 1.0], // Cyan
    [245, 66, 180, 1.0], // Pink
    [180, 245, 66, 1.0], // Lime
  ],

  _initialized: false,

  async init(renderer) {
    // No special init needed for shapes mode
  },

  async loadAssets(renderer) {
    // No textures needed - pure shapes!
  },

  activate() {
    console.log("Activated: Basic Shapes (Colorful) mode");
  },

  deactivate() {},

  update(dt) {
    // No animations needed for basic shapes
  },

  renderFood(foods, renderer) {
    const gameScale = renderer.getGameScale();
    for (let i = 0; i < foods.length; i++) {
      const food = foods[i];
      const screen = renderer.worldToScreen(food.x, food.y);
      const radius = gameScale * 0.8;
      const colorIndex = i % this.foodColors.length;
      const color = this.foodColors[colorIndex].map((c, idx) =>
        idx < 3 ? c / 255 : c
      );
      renderer.drawCircle(screen.x, screen.y, radius, color);
    }
  },

  renderBlobs(blobs, animations, agentRadius, initialMass, renderer) {
    const gameScale = renderer.getGameScale();

    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      if (!blob.alive) continue;

      const screen = renderer.worldToScreen(blob.x, blob.y);

      const baseSize = agentRadius * gameScale * 2;
      const massScale = blob.mass / initialMass;
      const animScale = animations[i]?.scale || 1.0;
      const size = Math.max(10, baseSize * massScale * animScale);

      const colorIndex = i % this.blobColors.length;
      const color = this.blobColors[colorIndex].map((c, idx) =>
        idx < 3 ? c / 255 : c
      );

      // Draw as arrow pointing in direction of movement
      renderer.drawArrow(screen.x, screen.y, size, blob.angle, color);
    }
  },

  renderPlayerIndicator(playerBlob, blobSize, screenPos, bobOffset, renderer) {
    // Draw a pulsing circle outline around player
    const radius = blobSize / 2 + 10 + bobOffset * 0.5;
    renderer.drawCircleOutline(
      screenPos.x,
      screenPos.y,
      radius,
      [0.2, 0.86, 0.4, 0.8],
      3
    );
  },

  renderParticles(particles, renderer) {
    renderer.renderParticles(particles);
  },

  getExplosionColors(blobId) {
    const color = this.blobColors[blobId % this.blobColors.length];
    return [
      color.slice(0, 3),
      color.slice(0, 3).map((c) => Math.min(255, c * 1.3)),
      [255, 255, 255],
    ];
  },
};
