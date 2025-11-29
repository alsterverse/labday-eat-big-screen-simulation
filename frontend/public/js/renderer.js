/**
 * WebGL2 Renderer for Blob Compete (Client Version)
 * Supports pluggable graphics modes
 */

const Renderer = (function () {
  let gl = null;
  let canvas = null;

  let spriteProgram = null;
  let particleProgram = null;
  let solidProgram = null;
  let quadBuffer = null;
  let particleBuffer = null;
  let triangleBuffer = null;
  let circleBuffer = null;

  const textures = {};
  let particles = [];
  const MAX_PARTICLES = 500;

  let blobAnimations = [];
  let arrowBobTime = 0;

  let audioContext = null;
  let eatSoundFallback = null;
  const characterSounds = {};

  let viewportWidth = 900;
  let viewportHeight = 800;
  let gameScale = 8;

  // These will be set from server state
  let mapSize = 100;
  let initialMass = 5.0;

  // Camera offset for following player on mobile
  let cameraOffsetX = 0;
  let cameraOffsetY = 0;

  // Graphics modes
  const modes = {};
  let currentMode = null;
  let currentModeName = "imageBasedFunny";

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
      vec2 scaledPosition = a_position * u_scale;
      float c = cos(u_rotation);
      float s = sin(u_rotation);
      vec2 rotatedPosition = vec2(
        scaledPosition.x * c - scaledPosition.y * s,
        scaledPosition.x * s + scaledPosition.y * c
      );
      vec2 position = rotatedPosition + u_translation;
      vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
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
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      float alpha = v_color.a * (1.0 - dist * 2.0);
      outColor = vec4(v_color.rgb, alpha);
    }
  `;

  const solidVertexShader = `#version 300 es
    in vec2 a_position;
    uniform vec2 u_resolution;
    void main() {
      vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    }
  `;

  const solidFragmentShader = `#version 300 es
    precision highp float;
    uniform vec4 u_color;
    out vec4 outColor;
    void main() {
      outColor = u_color;
    }
  `;

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

  function loadTexture(name, url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
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

  // Mode management
  function registerMode(mode) {
    modes[mode.id] = mode;
  }

  async function setMode(modeName) {
    if (!modes[modeName]) {
      console.error(`Unknown graphics mode: ${modeName}`);
      return false;
    }

    // Deactivate current mode
    if (currentMode) {
      currentMode.deactivate();
    }

    // Switch to new mode
    currentMode = modes[modeName];
    currentModeName = modeName;

    // Initialize if first time
    if (!currentMode._initialized) {
      await currentMode.init(publicAPI);
      await currentMode.loadAssets(publicAPI);
      currentMode._initialized = true;
    }

    // Activate
    currentMode.activate();

    // Update UI button if it exists
    updateModeButton();

    console.log(`Switched to graphics mode: ${currentMode.name}`);
    return true;
  }

  function cycleMode() {
    const modeNames = Object.keys(modes);
    const currentIndex = modeNames.indexOf(currentModeName);
    const nextIndex = (currentIndex + 1) % modeNames.length;
    setMode(modeNames[nextIndex]);
  }

  function updateModeButton() {
    const btn = document.getElementById("graphics-mode-btn");
    if (btn && currentMode) {
      btn.textContent = `Mode: ${currentMode.name}`;
    }
  }

  async function init(canvasElement) {
    canvas = canvasElement;
    gl = canvas.getContext("webgl2", { alpha: false, antialias: true });

    if (!gl) {
      throw new Error("WebGL2 not supported");
    }

    spriteProgram = createProgram(spriteVertexShader, spriteFragmentShader);
    particleProgram = createProgram(particleVertexShader, particleFragmentShader);
    solidProgram = createProgram(solidVertexShader, solidFragmentShader);

    ModelRenderer.init(gl);

    const quadVertices = new Float32Array([
      -0.5, -0.5, 0, 1,
       0.5, -0.5, 1, 1,
      -0.5,  0.5, 0, 0,
       0.5,  0.5, 1, 0,
    ]);
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    particleBuffer = gl.createBuffer();
    triangleBuffer = gl.createBuffer();
    circleBuffer = gl.createBuffer();

    // Register available graphics modes
    registerMode(ImageBasedFunnyMode);
    registerMode(BasicShapesColorfulMode);

    // Initialize and activate default mode
    await setMode(currentModeName);

    // Load audio
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    async function loadAudioBuffer(url) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return audioContext.decodeAudioData(arrayBuffer);
    }
    eatSoundFallback = await loadAudioBuffer("assets/eat.ogg");

    // Load character-specific sounds (fail silently if not found)
    const characters = ["mats", "krille", "tommi", "per", "linda"];
    await Promise.all(characters.map(async (char) => {
      try {
        characterSounds[char] = await loadAudioBuffer(`assets/players/${char}.ogg`);
      } catch (e) {
        // No sound for this character, will use fallback
      }
    }));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
  }

  function setGameConstants(newMapSize, newInitialMass) {
    mapSize = newMapSize;
    initialMass = newInitialMass;
    resize();
  }

  function resize() {
    viewportWidth = canvas.clientWidth;
    viewportHeight = canvas.clientHeight;
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    const margin = 10;
    gameScale = Math.min(
      (viewportWidth - margin * 2) / mapSize,
      (viewportHeight - margin * 2) / mapSize
    );

    gl.viewport(0, 0, viewportWidth, viewportHeight);
  }

  function worldToScreen(x, y) {
    const offsetX = (viewportWidth - mapSize * gameScale) / 2;
    const offsetY = (viewportHeight - mapSize * gameScale) / 2;
    return {
      x: offsetX + x * gameScale - cameraOffsetX,
      y: offsetY + y * gameScale - cameraOffsetY,
    };
  }

  function drawSprite(textureName, x, y, size, rotation, flipY = false) {
    const tex = textures[textureName];
    if (!tex) return;

    gl.useProgram(spriteProgram);

    gl.uniform2f(gl.getUniformLocation(spriteProgram, "u_resolution"), viewportWidth, viewportHeight);
    gl.uniform2f(gl.getUniformLocation(spriteProgram, "u_translation"), x, y);
    gl.uniform2f(gl.getUniformLocation(spriteProgram, "u_scale"), size, size);
    gl.uniform1f(gl.getUniformLocation(spriteProgram, "u_rotation"), rotation);
    gl.uniform1i(gl.getUniformLocation(spriteProgram, "u_flipY"), flipY ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.texture);
    gl.uniform1i(gl.getUniformLocation(spriteProgram, "u_texture"), 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posLoc = gl.getAttribLocation(spriteProgram, "a_position");
    const texLoc = gl.getAttribLocation(spriteProgram, "a_texCoord");

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawTriangle(x, y, size, color) {
    // Draw a downward-pointing triangle at (x, y)
    // color is [r, g, b, a] with values 0-1
    const halfWidth = size * 0.6;
    const height = size;

    // Triangle vertices: tip at bottom, flat top
    const vertices = new Float32Array([
      x, y + height / 2,           // Bottom tip
      x - halfWidth, y - height / 2, // Top left
      x + halfWidth, y - height / 2, // Top right
    ]);

    gl.useProgram(solidProgram);
    gl.uniform2f(gl.getUniformLocation(solidProgram, "u_resolution"), viewportWidth, viewportHeight);
    gl.uniform4fv(gl.getUniformLocation(solidProgram, "u_color"), color);

    gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

    const posLoc = gl.getAttribLocation(solidProgram, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawCircle(x, y, radius, color, segments = 32) {
    // Draw a filled circle at (x, y)
    // color is [r, g, b, a] with values 0-1
    const vertices = new Float32Array((segments + 2) * 2);

    // Center vertex
    vertices[0] = x;
    vertices[1] = y;

    // Circle vertices
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      vertices[(i + 1) * 2] = x + Math.cos(angle) * radius;
      vertices[(i + 1) * 2 + 1] = y + Math.sin(angle) * radius;
    }

    gl.useProgram(solidProgram);
    gl.uniform2f(gl.getUniformLocation(solidProgram, "u_resolution"), viewportWidth, viewportHeight);
    gl.uniform4fv(gl.getUniformLocation(solidProgram, "u_color"), color);

    gl.bindBuffer(gl.ARRAY_BUFFER, circleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

    const posLoc = gl.getAttribLocation(solidProgram, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, segments + 2);
  }

  function drawCircleOutline(x, y, radius, color, lineWidth = 2, segments = 32) {
    // Draw a circle outline using line strip
    // We draw multiple circles at slightly different radii to achieve line width
    const innerRadius = radius - lineWidth / 2;
    const outerRadius = radius + lineWidth / 2;

    // Create a ring (quad strip)
    const vertices = new Float32Array((segments + 1) * 4);

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Inner vertex
      vertices[i * 4] = x + cos * innerRadius;
      vertices[i * 4 + 1] = y + sin * innerRadius;
      // Outer vertex
      vertices[i * 4 + 2] = x + cos * outerRadius;
      vertices[i * 4 + 3] = y + sin * outerRadius;
    }

    gl.useProgram(solidProgram);
    gl.uniform2f(gl.getUniformLocation(solidProgram, "u_resolution"), viewportWidth, viewportHeight);
    gl.uniform4fv(gl.getUniformLocation(solidProgram, "u_color"), color);

    gl.bindBuffer(gl.ARRAY_BUFFER, circleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

    const posLoc = gl.getAttribLocation(solidProgram, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, (segments + 1) * 2);
  }

  function drawArrow(x, y, size, angle, color) {
    // Draw an arrow pointing in the direction of angle
    // Arrow shape: triangle with a notch at the back
    const halfSize = size / 2;

    // Define arrow shape pointing right (angle 0)
    const arrowPoints = [
      [halfSize, 0],           // Tip
      [-halfSize * 0.6, -halfSize * 0.5], // Top back
      [-halfSize * 0.2, 0],    // Notch
      [-halfSize * 0.6, halfSize * 0.5],  // Bottom back
    ];

    // Rotate and translate points
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const rotatedPoints = arrowPoints.map(([px, py]) => [
      x + px * cos - py * sin,
      y + px * sin + py * cos,
    ]);

    // Create triangles: tip-topback-notch, tip-notch-bottomback
    const vertices = new Float32Array([
      rotatedPoints[0][0], rotatedPoints[0][1], // Tip
      rotatedPoints[1][0], rotatedPoints[1][1], // Top back
      rotatedPoints[2][0], rotatedPoints[2][1], // Notch
      rotatedPoints[0][0], rotatedPoints[0][1], // Tip
      rotatedPoints[2][0], rotatedPoints[2][1], // Notch
      rotatedPoints[3][0], rotatedPoints[3][1], // Bottom back
    ]);

    gl.useProgram(solidProgram);
    gl.uniform2f(gl.getUniformLocation(solidProgram, "u_resolution"), viewportWidth, viewportHeight);
    gl.uniform4fv(gl.getUniformLocation(solidProgram, "u_color"), color);

    gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

    const posLoc = gl.getAttribLocation(solidProgram, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawTaperedLine(x1, y1, x2, y2, width1, width2, color) {
    // Draw a line segment that tapers from width1 at (x1,y1) to width2 at (x2,y2)
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;

    // Perpendicular unit vector
    const px = -dy / len;
    const py = dx / len;

    // Four corners of the quad
    const halfW1 = width1 / 2;
    const halfW2 = width2 / 2;

    const vertices = new Float32Array([
      x1 + px * halfW1, y1 + py * halfW1,
      x1 - px * halfW1, y1 - py * halfW1,
      x2 + px * halfW2, y2 + py * halfW2,
      x2 - px * halfW2, y2 - py * halfW2,
    ]);

    gl.useProgram(solidProgram);
    gl.uniform2f(gl.getUniformLocation(solidProgram, "u_resolution"), viewportWidth, viewportHeight);
    gl.uniform4fv(gl.getUniformLocation(solidProgram, "u_color"), color);

    gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

    const posLoc = gl.getAttribLocation(solidProgram, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function triggerBounce(blobId) {
    while (blobAnimations.length <= blobId) {
      blobAnimations.push({ scale: 1.0, bounceTime: 0, spinAngle: 0, spinTime: 0 });
    }
    blobAnimations[blobId].bounceTime = 0.4;
  }

  function triggerSpin(blobId) {
    while (blobAnimations.length <= blobId) {
      blobAnimations.push({ scale: 1.0, bounceTime: 0, spinAngle: 0, spinTime: 0 });
    }
    blobAnimations[blobId].spinTime = 0.5;
    blobAnimations[blobId].spinAngle = 0;
  }

  function playEatSound(character) {
    if (!audioContext || audioContext.state === "suspended") {
      audioContext?.resume();
      return;
    }
    const buffer = characterSounds[character] || eatSoundFallback;
    if (!buffer) return;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
  }

  function spawnExplosion(x, y, blobId) {
    const colors = currentMode
      ? currentMode.getExplosionColors(blobId)
      : [
          [50, 120, 220],
          [150, 200, 255],
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

  function updateAnimations(dt) {
    for (let i = 0; i < blobAnimations.length; i++) {
      if (blobAnimations[i].bounceTime > 0) {
        blobAnimations[i].bounceTime -= dt;
        const t = 1 - blobAnimations[i].bounceTime / 0.4;
        const decay = Math.exp(-4 * t);
        const oscillation = Math.sin(t * Math.PI * 4);
        const bounce = decay * oscillation * 0.25;
        blobAnimations[i].scale = 1.0 + bounce;
      } else {
        blobAnimations[i].scale = 1.0;
      }

      if (blobAnimations[i].spinTime > 0) {
        blobAnimations[i].spinTime -= dt;
        const spinDuration = 0.5;
        const t = 1 - blobAnimations[i].spinTime / spinDuration;
        blobAnimations[i].spinAngle = t * Math.PI * 2;
      } else {
        blobAnimations[i].spinAngle = 0;
      }
    }

    // Update mode-specific animations
    if (currentMode && currentMode.update) {
      currentMode.update(dt);
    }

    // Update arrow bob animation
    arrowBobTime += dt * 3;
  }

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

      p.vy += gravity * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = 1.0 - p.age / p.lifetime;
      p.size *= 0.99;
    }
  }

  function renderParticles() {
    if (particles.length === 0) return;

    gl.useProgram(particleProgram);
    gl.uniform2f(gl.getUniformLocation(particleProgram, "u_resolution"), viewportWidth, viewportHeight);

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

  function render(state, playerBlobIndex = -1) {
    if (!state || !currentMode) return;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const agentRadius = state.agentRadius || 2.5;

    // Update camera to follow player on mobile
    const isMobile = PlayerInput.isMobileDevice();
    if (isMobile && playerBlobIndex >= 0) {
      if (state.blobs[playerBlobIndex]?.alive) {
        const playerBlob = state.blobs[playerBlobIndex];
        const targetX = playerBlob.x * gameScale - viewportWidth / 2;
        const targetY = playerBlob.y * gameScale - viewportHeight / 2;

        // Smooth camera movement - faster lerp for more responsive feel
        const lerpFactor = 0.2;
        cameraOffsetX += (targetX - cameraOffsetX) * lerpFactor;
        cameraOffsetY += (targetY - cameraOffsetY) * lerpFactor;

        // Clamp camera to map bounds
        const mapPixelWidth = mapSize * gameScale;
        const mapPixelHeight = mapSize * gameScale;
        cameraOffsetX = Math.max(-(viewportWidth - mapPixelWidth) / 2, Math.min(cameraOffsetX, (viewportWidth - mapPixelWidth) / 2));
        cameraOffsetY = Math.max(-(viewportHeight - mapPixelHeight) / 2, Math.min(cameraOffsetY, (viewportHeight - mapPixelHeight) / 2));
      }
      // Keep camera at last position when dead (don't reset to 0)
    } else {
      // Reset camera on desktop or when not playing
      cameraOffsetX = 0;
      cameraOffsetY = 0;
    }

    // Ensure blob animations array is sized correctly
    while (blobAnimations.length < state.blobs.length) {
      blobAnimations.push({ scale: 1.0, bounceTime: 0, spinAngle: 0, spinTime: 0 });
    }

    // Delegate rendering to current mode
    currentMode.renderFood(state.foods, publicAPI);
    currentMode.renderBlobs(state.blobs, blobAnimations, agentRadius, initialMass, publicAPI);

    // Draw player indicator
    if (playerBlobIndex >= 0 && state.blobs[playerBlobIndex]?.alive) {
      const playerBlob = state.blobs[playerBlobIndex];
      const screen = worldToScreen(playerBlob.x, playerBlob.y);

      // Calculate blob size for positioning
      const baseSize = agentRadius * gameScale * 2;
      const massScale = playerBlob.mass / initialMass;
      const blobSize = baseSize * massScale;

      // Bob animation offset
      const bobOffset = Math.sin(arrowBobTime) * 5;

      currentMode.renderPlayerIndicator(playerBlob, blobSize, screen, bobOffset, publicAPI);
    }

    // Render particles
    currentMode.renderParticles(particles, publicAPI);
  }

  // Public API exposed to modes
  const publicAPI = {
    init,
    resize,
    render,
    setGameConstants,
    updateAnimations,
    updateParticles,
    triggerBounce,
    triggerSpin,
    playEatSound,
    spawnExplosion,
    worldToScreen,

    // Drawing primitives for modes
    drawSprite,
    drawTriangle,
    drawCircle,
    drawCircleOutline,
    drawArrow,
    drawTaperedLine,
    renderParticles,
    loadTexture,

    // Getters for mode access
    getGameScale: () => gameScale,
    getViewport: () => ({ width: viewportWidth, height: viewportHeight }),
    getMapSize: () => mapSize,

    // Mode management
    setMode,
    cycleMode,
    getCurrentMode: () => currentModeName,
    getAvailableModes: () => Object.keys(modes),
  };

  return publicAPI;
})();
