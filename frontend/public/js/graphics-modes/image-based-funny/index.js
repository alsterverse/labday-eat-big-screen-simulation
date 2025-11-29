/**
 * Image Based Funny Graphics Mode
 * Original sprite-based rendering with PNG textures and 3D model support
 */

const ImageBasedFunnyMode = {
  id: "imageBasedFunny",
  name: "Image Based (Funny)",

  // Internal state
  foodRotations: [],
  _initialized: false,

  async init(renderer) {
    // Initialize food rotations
    for (let i = 0; i < 20; i++) {
      this.foodRotations.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }
  },

  async loadAssets(renderer) {
    await Promise.all([
      renderer.loadTexture("blob1", "assets/blob1.png"),
      renderer.loadTexture("blob2", "assets/blob2.png"),
      renderer.loadTexture("food", "assets/food.png"),
      renderer.loadTexture("trophy", "assets/trophy.png"),
      renderer.loadTexture("player_mats", "assets/players/mats.png"),
      renderer.loadTexture("player_krille", "assets/players/krille.png"),
      renderer.loadTexture("player_tommi", "assets/players/tommi.png"),
      renderer.loadTexture("player_per", "assets/players/per.png"),
      renderer.loadTexture("player_linda", "assets/players/linda.png"),
      ModelRenderer.loadModel("linda", "assets/linda.glb"),
    ]);
  },

  activate() {
    console.log("Activated: Image Based (Funny) mode");
  },

  deactivate() {},

  update(dt) {
    for (const rot of this.foodRotations) {
      rot.angle += rot.speed * dt;
    }
  },

  renderFood(foods, renderer) {
    const gameScale = renderer.getGameScale();
    for (let i = 0; i < foods.length; i++) {
      const food = foods[i];
      const screen = renderer.worldToScreen(food.x, food.y);
      const rotation = this.foodRotations[i % this.foodRotations.length].angle;
      const size = gameScale * 3;
      renderer.drawSprite("food", screen.x, screen.y, size, rotation);
    }
  },

  renderBlobs(blobs, animations, agentRadius, initialMass, renderer) {
    const gameScale = renderer.getGameScale();
    const viewport = renderer.getViewport();

    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      if (!blob.alive) continue;

      const screen = renderer.worldToScreen(blob.x, blob.y);

      const baseSize = agentRadius * gameScale * 2;
      const massScale = blob.mass / initialMass;
      const animScale = animations[i]?.scale || 1.0;
      const size = Math.max(10, baseSize * massScale * animScale);

      if (blob.character === "linda" && ModelRenderer.isLoaded("linda")) {
        const modelScale = size * 1.0;
        const spinAngle = animations[i]?.spinAngle || 0;
        ModelRenderer.render(
          "linda",
          screen.x,
          screen.y,
          modelScale,
          blob.angle,
          viewport.width,
          viewport.height,
          spinAngle
        );
      } else {
        let texName;
        if (blob.character) {
          texName = `player_${blob.character}`;
        } else {
          texName = i % 2 === 0 ? "blob1" : "blob2";
        }

        let rotation = blob.angle;
        const flipY = Math.abs(blob.angle) > Math.PI / 2;
        if (flipY) {
          rotation = Math.PI - rotation;
        }

        renderer.drawSprite(texName, screen.x, screen.y, size, rotation, flipY);
      }
    }
  },

  renderPlayerIndicator(playerBlob, blobSize, screenPos, bobOffset, renderer) {
    const arrowY = screenPos.y - blobSize / 2 - 20 + bobOffset;
    const arrowSize = 20;
    // Green color: #32dc64 = rgb(50, 220, 100)
    renderer.drawTriangle(screenPos.x, arrowY, arrowSize, [
      50 / 255,
      220 / 255,
      100 / 255,
      1.0,
    ]);
  },

  renderParticles(particles, renderer) {
    renderer.renderParticles(particles);
  },

  getExplosionColors(blobId) {
    const colorSets = [
      [
        [50, 120, 220],
        [150, 200, 255],
        [255, 255, 255],
      ],
      [
        [220, 50, 50],
        [255, 150, 150],
        [255, 255, 255],
      ],
      [
        [50, 220, 100],
        [150, 255, 180],
        [255, 255, 255],
      ],
    ];
    return colorSets[Math.min(blobId, colorSets.length - 1)];
  },
};
