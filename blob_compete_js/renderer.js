/**
 * WebGL2 Renderer for Blob Compete
 * Handles sprite rendering and particle effects
 */

const Renderer = (function () {
  let gl = null;
  let canvas = null;

  // Shaders
  let spriteProgram = null;
  let particleProgram = null;

  // Buffers
  let quadBuffer = null;
  let particleBuffer = null;

  // Textures
  const textures = {};

  // Particles
  let particles = [];
  const MAX_PARTICLES = 500;

  // Animations
  const blobAnimations = [
    { scale: 1.0, bounceTime: 0 },
    { scale: 1.0, bounceTime: 0 },
  ];
  const foodRotations = [];

  // Web Audio API for low-latency sound
  let audioContext = null;
  let eatSound1Buffer = null;
  let eatSound2Buffer = null;

  // Viewport
  let viewportWidth = 900;
  let viewportHeight = 800;
  let gameScale = 8; // pixels per world unit

  // Shader sources
  const spriteVertexShader = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;

    uniform vec2 u_resolution;
    uniform vec2 u_translation;
    uniform vec2 u_scale;
    uniform float u_rotation;
    uniform bool u_flipY;

    out vec2 v_texCoord;

    void main() {
      // Apply scale
      vec2 scaledPosition = a_position * u_scale;

      // Apply rotation
      float c = cos(u_rotation);
      float s = sin(u_rotation);
      vec2 rotatedPosition = vec2(
        scaledPosition.x * c - scaledPosition.y * s,
        scaledPosition.x * s + scaledPosition.y * c
      );

      // Apply translation
      vec2 position = rotatedPosition + u_translation;

      // Convert to clip space
      vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

      // Pass texture coordinates
      v_texCoord = a_texCoord;
      if (u_flipY) {
        v_texCoord.y = 1.0 - v_texCoord.y;
      }
    }
  `;

  const spriteFragmentShader = `#version 300 es
    precision highp float;

    in vec2 v_texCoord;
    uniform sampler2D u_texture;

    out vec4 outColor;

    void main() {
      outColor = texture(u_texture, v_texCoord);
    }
  `;

  const particleVertexShader = `#version 300 es
    in vec2 a_position;
    in vec4 a_color;
    in float a_size;

    uniform vec2 u_resolution;

    out vec4 v_color;

    void main() {
      vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      gl_PointSize = a_size;
      v_color = a_color;
    }
  `;

  const particleFragmentShader = `#version 300 es
    precision highp float;

    in vec4 v_color;
    out vec4 outColor;

    void main() {
      // Circular particles
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;

      // Soft edges
      float alpha = v_color.a * (1.0 - dist * 2.0);
      outColor = vec4(v_color.rgb, alpha);
    }
  `;

  /**
   * Compile a shader
   */
  function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Create a shader program
   */
  function createProgram(vertexSource, fragmentSource) {
    const vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  /**
   * Load a texture from URL
   */
  function loadTexture(name, url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        textures[name] = { texture, width: image.width, height: image.height };
        resolve();
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  /**
   * Initialize the renderer
   */
  async function init(canvasElement) {
    canvas = canvasElement;
    gl = canvas.getContext("webgl2", { alpha: false, antialias: true });

    if (!gl) {
      throw new Error("WebGL2 not supported");
    }

    // Create shader programs
    spriteProgram = createProgram(spriteVertexShader, spriteFragmentShader);
    particleProgram = createProgram(
      particleVertexShader,
      particleFragmentShader
    );

    // Create quad buffer for sprites
    // prettier-ignore
    const quadVertices = new Float32Array([
      // position (x, y), texCoord (u, v)
      -0.5, -0.5, 0, 1,
       0.5, -0.5, 1, 1,
      -0.5,  0.5, 0, 0,
       0.5,  0.5, 1, 0,
    ]);
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    // Create particle buffer
    particleBuffer = gl.createBuffer();

    // Load textures
    await Promise.all([
      loadTexture("blob1", "assets/blob1.png"),
      loadTexture("blob2", "assets/blob2.png"),
      loadTexture("food", "assets/food.png"),
      loadTexture("trophy", "assets/trophy.png"),
    ]);

    // Initialize food rotations
    for (let i = 0; i < 20; i++) {
      foodRotations.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }

    // Initialize Web Audio API
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    async function loadAudioBuffer(url) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return audioContext.decodeAudioData(arrayBuffer);
    }
    [eatSound1Buffer, eatSound2Buffer] = await Promise.all([
      loadAudioBuffer("assets/eat1.ogg"),
      loadAudioBuffer("assets/eat2.ogg"),
    ]);

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
  }

  /**
   * Handle canvas resize
   */
  function resize() {
    viewportWidth = canvas.clientWidth;
    viewportHeight = canvas.clientHeight;
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    // Calculate scale to fit game area
    const margin = 10;
    gameScale = Math.min(
      (viewportWidth - margin * 2) / Game.MAP_SIZE,
      (viewportHeight - margin * 2) / Game.MAP_SIZE
    );

    gl.viewport(0, 0, viewportWidth, viewportHeight);
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  function worldToScreen(x, y) {
    const offsetX = (viewportWidth - Game.MAP_SIZE * gameScale) / 2;
    const offsetY = (viewportHeight - Game.MAP_SIZE * gameScale) / 2;
    return {
      x: offsetX + x * gameScale,
      y: offsetY + y * gameScale,
    };
  }

  /**
   * Draw a sprite
   */
  function drawSprite(textureName, x, y, size, rotation, flipY = false) {
    const tex = textures[textureName];
    if (!tex) return;

    gl.useProgram(spriteProgram);

    // Set uniforms
    gl.uniform2f(
      gl.getUniformLocation(spriteProgram, "u_resolution"),
      viewportWidth,
      viewportHeight
    );
    gl.uniform2f(
      gl.getUniformLocation(spriteProgram, "u_translation"),
      x,
      y
    );
    gl.uniform2f(
      gl.getUniformLocation(spriteProgram, "u_scale"),
      size,
      size
    );
    gl.uniform1f(
      gl.getUniformLocation(spriteProgram, "u_rotation"),
      rotation
    );
    gl.uniform1i(
      gl.getUniformLocation(spriteProgram, "u_flipY"),
      flipY ? 1 : 0
    );

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.texture);
    gl.uniform1i(gl.getUniformLocation(spriteProgram, "u_texture"), 0);

    // Set up vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posLoc = gl.getAttribLocation(spriteProgram, "a_position");
    const texLoc = gl.getAttribLocation(spriteProgram, "a_texCoord");

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Trigger bounce animation for a blob
   */
  function triggerBounce(blobId) {
    blobAnimations[blobId].bounceTime = 0.4;
  }

  /**
   * Play eat sound (80% eat1, 20% eat2)
   * Uses Web Audio API for low-latency playback
   */
  function playEatSound() {
    if (!audioContext || audioContext.state === "suspended") {
      audioContext?.resume();
      return;
    }
    const buffer = Math.random() < 0.2 ? eatSound2Buffer : eatSound1Buffer;
    if (!buffer) return;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
  }

  /**
   * Spawn explosion particles
   */
  function spawnExplosion(x, y, blobId) {
    const colors =
      blobId === 0
        ? [
            [50, 120, 220],
            [150, 200, 255],
            [255, 255, 255],
          ]
        : [
            [220, 50, 50],
            [255, 150, 150],
            [255, 255, 255],
          ];

    const count = Math.min(80, MAX_PARTICLES - particles.length);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 150;
      const color = colors[Math.floor(Math.random() * colors.length)];

      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        alpha: 1.0,
        size: 2 + Math.random() * 4,
        lifetime: 0.5 + Math.random() * 1.0,
        age: 0,
      });
    }
  }

  /**
   * Update animations
   */
  function updateAnimations(dt) {
    // Update bounce animations
    for (let i = 0; i < 2; i++) {
      if (blobAnimations[i].bounceTime > 0) {
        blobAnimations[i].bounceTime -= dt;
        // Elastic spring: decaying oscillation
        const t = 1 - blobAnimations[i].bounceTime / 0.4;
        const decay = Math.exp(-4 * t);
        const oscillation = Math.sin(t * Math.PI * 4); // 2 full oscillations
        const bounce = decay * oscillation * 0.25;
        blobAnimations[i].scale = 1.0 + bounce;
      } else {
        blobAnimations[i].scale = 1.0;
      }
    }

    // Update food rotations
    for (const rot of foodRotations) {
      rot.angle += rot.speed * dt;
    }
  }

  /**
   * Update particles
   */
  function updateParticles(dt) {
    const gravity = 150;
    const drag = 0.98;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;

      if (p.age >= p.lifetime) {
        particles.splice(i, 1);
        continue;
      }

      // Physics
      p.vy += gravity * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Fade out
      p.alpha = 1.0 - p.age / p.lifetime;
      p.size *= 0.99;
    }
  }

  /**
   * Render particles
   */
  function renderParticles() {
    if (particles.length === 0) return;

    gl.useProgram(particleProgram);

    // Set resolution uniform
    gl.uniform2f(
      gl.getUniformLocation(particleProgram, "u_resolution"),
      viewportWidth,
      viewportHeight
    );

    // Build particle data
    const data = new Float32Array(particles.length * 7);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const offset = i * 7;
      data[offset] = p.x;
      data[offset + 1] = p.y;
      data[offset + 2] = p.color[0] / 255;
      data[offset + 3] = p.color[1] / 255;
      data[offset + 4] = p.color[2] / 255;
      data[offset + 5] = p.alpha;
      data[offset + 6] = p.size;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    // Set up attributes
    const posLoc = gl.getAttribLocation(particleProgram, "a_position");
    const colorLoc = gl.getAttribLocation(particleProgram, "a_color");
    const sizeLoc = gl.getAttribLocation(particleProgram, "a_size");

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(sizeLoc);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 28, 24);

    gl.drawArrays(gl.POINTS, 0, particles.length);
  }

  /**
   * Render the game
   */
  function render(state) {
    // Clear
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw game area border
    // (simplified - just draw sprites for now)

    // Draw foods
    for (let i = 0; i < state.foods.length; i++) {
      const food = state.foods[i];
      const screen = worldToScreen(food.x, food.y);
      const rotation = foodRotations[i % foodRotations.length].angle;
      const size = gameScale * 3;
      drawSprite("food", screen.x, screen.y, size, rotation);
    }

    // Draw blobs
    for (let i = 0; i < state.blobs.length; i++) {
      const blob = state.blobs[i];
      const screen = worldToScreen(blob.x, blob.y);
      const texName = i === 0 ? "blob1" : "blob2";

      // Calculate size based on mass and animation
      const baseSize = state.agentRadius * gameScale * 2;
      const massScale = blob.mass / Game.INITIAL_MASS;
      const animScale = blobAnimations[i].scale;
      const size = Math.max(10, baseSize * massScale * animScale);

      // Adjust rotation for sprite orientation
      let rotation = blob.angle;
      const flipY = Math.abs(blob.angle) > Math.PI / 2;
      if (flipY) {
        rotation = Math.PI - rotation;
      }

      drawSprite(texName, screen.x, screen.y, size, rotation, flipY);
    }

    // Draw particles on top
    renderParticles();
  }

  return {
    init,
    resize,
    render,
    updateAnimations,
    updateParticles,
    triggerBounce,
    playEatSound,
    spawnExplosion,
    worldToScreen,
  };
})();
