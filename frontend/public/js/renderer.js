/**
 * WebGL2 Renderer for Blob Compete (Client Version)
 * Adapted to receive state from server
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

  const textures = {};
  let particles = [];
  const MAX_PARTICLES = 500;

  let blobAnimations = [];
  const foodRotations = [];
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

    await Promise.all([
      loadTexture("blob1", "assets/blob1.png"),
      loadTexture("blob2", "assets/blob2.png"),
      loadTexture("food", "assets/food.png"),
      loadTexture("trophy", "assets/trophy.png"),
      loadTexture("player_mats", "assets/players/mats.png"),
      loadTexture("player_krille", "assets/players/krille.png"),
      loadTexture("player_tommi", "assets/players/tommi.png"),
      loadTexture("player_per", "assets/players/per.png"),
      loadTexture("player_linda", "assets/players/linda.png"),
      ModelRenderer.loadModel("linda", "assets/linda.glb"),
    ]);

    for (let i = 0; i < 20; i++) {
      foodRotations.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }

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
      x: offsetX + x * gameScale,
      y: offsetY + y * gameScale,
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
    const colorSets = [
      [[50, 120, 220], [150, 200, 255], [255, 255, 255]],
      [[220, 50, 50], [255, 150, 150], [255, 255, 255]],
      [[50, 220, 100], [150, 255, 180], [255, 255, 255]],
    ];
    const colors = colorSets[Math.min(blobId, colorSets.length - 1)];
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

    for (const rot of foodRotations) {
      rot.angle += rot.speed * dt;
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
    if (!state) return;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const agentRadius = state.agentRadius || 2.5;

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
      if (!blob.alive) continue;

      const screen = worldToScreen(blob.x, blob.y);

      while (blobAnimations.length <= i) {
        blobAnimations.push({ scale: 1.0, bounceTime: 0, spinAngle: 0, spinTime: 0 });
      }

      const baseSize = agentRadius * gameScale * 2;
      const massScale = blob.mass / initialMass;
      const animScale = blobAnimations[i].scale;
      const size = Math.max(10, baseSize * massScale * animScale);

      if (blob.character === "linda" && ModelRenderer.isLoaded("linda")) {
        const modelScale = size * 1.0;
        const spinAngle = blobAnimations[i].spinAngle || 0;
        ModelRenderer.render("linda", screen.x, screen.y, modelScale, blob.angle, viewportWidth, viewportHeight, spinAngle);
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

        drawSprite(texName, screen.x, screen.y, size, rotation, flipY);
      }
    }

    // Draw player indicator arrow
    if (playerBlobIndex >= 0 && state.blobs[playerBlobIndex]?.alive) {
      const playerBlob = state.blobs[playerBlobIndex];
      const screen = worldToScreen(playerBlob.x, playerBlob.y);

      // Calculate blob size for positioning
      const baseSize = agentRadius * gameScale * 2;
      const massScale = playerBlob.mass / initialMass;
      const blobSize = baseSize * massScale;

      // Arrow position: above the blob with bobbing animation
      const bobOffset = Math.sin(arrowBobTime) * 5;
      const arrowY = screen.y - blobSize / 2 - 20 + bobOffset;
      const arrowSize = 20;

      // Green color: #32dc64 = rgb(50, 220, 100)
      drawTriangle(screen.x, arrowY, arrowSize, [50/255, 220/255, 100/255, 1.0]);
    }

    renderParticles();
  }

  return {
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
  };
})();
