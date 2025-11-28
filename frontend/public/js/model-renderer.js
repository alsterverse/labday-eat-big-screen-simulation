/**
 * 3D Model Renderer for WebGL2
 * Renders GLTF models with basic lighting
 */

const ModelRenderer = (function () {
  let gl = null;
  let program = null;
  const loadedModels = {};

  const vertexShaderSource = `#version 300 es
    in vec3 a_position;
    in vec3 a_normal;
    in vec2 a_texCoord;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat3 u_normalMatrix;

    out vec3 v_normal;
    out vec2 v_texCoord;
    out vec3 v_worldPos;

    void main() {
      vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
      v_worldPos = worldPos.xyz;
      v_normal = u_normalMatrix * a_normal;
      v_texCoord = a_texCoord;
      gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
    }
  `;

  const fragmentShaderSource = `#version 300 es
    precision highp float;

    in vec3 v_normal;
    in vec2 v_texCoord;
    in vec3 v_worldPos;

    uniform vec4 u_baseColor;
    uniform sampler2D u_texture;
    uniform bool u_hasTexture;
    uniform vec3 u_lightDir;
    uniform vec3 u_ambientColor;
    uniform vec3 u_lightColor;

    out vec4 outColor;

    void main() {
      vec3 normal = normalize(v_normal);
      vec3 lightDir = normalize(u_lightDir);

      float diff = max(dot(normal, lightDir), 0.0);

      vec4 baseColor = u_baseColor;
      if (u_hasTexture) {
        baseColor *= texture(u_texture, v_texCoord);
      }

      vec3 ambient = u_ambientColor * baseColor.rgb;
      vec3 diffuse = u_lightColor * diff * baseColor.rgb;

      outColor = vec4(ambient + diffuse, baseColor.a);
    }
  `;

  function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Model shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    const vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vertexShader);
    gl.attachShader(prog, fragmentShader);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Model program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function init(glContext) {
    gl = glContext;
    program = createProgram(vertexShaderSource, fragmentShaderSource);
  }

  async function loadModel(name, url) {
    console.log('Loading GLTF model:', name, url);
    const gltfData = await GLTFLoader.load(url);
    console.log('GLTF data loaded:', gltfData.meshes.length, 'meshes');

    const model = {
      meshes: [],
    };

    for (const meshData of gltfData.meshes) {
      const mesh = {
        vao: gl.createVertexArray(),
        indexCount: 0,
        hasIndices: false,
        vertexCount: 0,
        texture: null,
        baseColor: [1, 1, 1, 1],
      };

      gl.bindVertexArray(mesh.vao);

      if (meshData.positions) {
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.positions, gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        mesh.vertexCount = meshData.positions.length / 3;
        console.log('Mesh vertices:', mesh.vertexCount, 'positions range:',
          Math.min(...meshData.positions), 'to', Math.max(...meshData.positions));
      }

      if (meshData.normals) {
        const normBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.normals, gl.STATIC_DRAW);
        const normLoc = gl.getAttribLocation(program, 'a_normal');
        gl.enableVertexAttribArray(normLoc);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
      }

      if (meshData.texCoords) {
        const texBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.texCoords, gl.STATIC_DRAW);
        const texLoc = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
      }

      if (meshData.indices) {
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);
        mesh.indexCount = meshData.indices.length;
        mesh.hasIndices = true;
        // Determine index type based on array type
        if (meshData.indices instanceof Uint32Array) {
          mesh.indexType = gl.UNSIGNED_INT;
        } else if (meshData.indices instanceof Uint16Array) {
          mesh.indexType = gl.UNSIGNED_SHORT;
        } else {
          mesh.indexType = gl.UNSIGNED_BYTE;
        }
      }

      if (meshData.material) {
        mesh.baseColor = meshData.material.baseColor;

        if (meshData.material.baseColorTexture) {
          mesh.texture = await loadTextureFromUrl(meshData.material.baseColorTexture);
        }
      }

      gl.bindVertexArray(null);
      model.meshes.push(mesh);
    }

    loadedModels[name] = model;
    return model;
  }

  function loadTextureFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        resolve(texture);
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  function mat4Create() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4Multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  }

  function mat4FromTranslation(x, y, z) {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1
    ]);
  }

  function mat4FromScaling(sx, sy, sz) {
    return new Float32Array([
      sx, 0, 0, 0,
      0, sy, 0, 0,
      0, 0, sz, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4FromRotationY(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4FromRotationX(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4FromRotationZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  function mat4Ortho(left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);

    return new Float32Array([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, 2 * nf, 0,
      (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
    ]);
  }

  function mat3NormalFromMat4(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[4], a11 = m[5], a12 = m[6];
    const a20 = m[8], a21 = m[9], a22 = m[10];

    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;

    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) det = 1;
    det = 1.0 / det;

    return new Float32Array([
      b01 * det,
      (-a22 * a01 + a02 * a21) * det,
      (a12 * a01 - a02 * a11) * det,
      b11 * det,
      (a22 * a00 - a02 * a20) * det,
      (-a12 * a00 + a02 * a10) * det,
      b21 * det,
      (-a21 * a00 + a01 * a20) * det,
      (a11 * a00 - a01 * a10) * det
    ]);
  }

  function render(modelName, x, y, scale, rotation, viewportWidth, viewportHeight, spinAngle = 0) {
    const model = loadedModels[modelName];
    if (!model) {
      console.warn('Model not found:', modelName);
      return;
    }

    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Convert screen coordinates to normalized device coordinates
    // Screen: (0,0) top-left, (width, height) bottom-right
    // NDC: (-1,-1) bottom-left, (1,1) top-right
    const ndcX = (x / viewportWidth) * 2 - 1;
    const ndcY = 1 - (y / viewportHeight) * 2;

    // Scale factor to convert model units to NDC
    // Assuming model is roughly 1-2 units, we want it to appear as 'scale' pixels
    const pixelToNDC = 2.0 / viewportWidth;
    const s = scale * pixelToNDC;

    // Build transformation: translate * rotateY * rotateX * scale
    const modelMatrix = new Float32Array([
      s, 0, 0, 0,
      0, s, 0, 0,
      0, 0, s, 0,
      ndcX, ndcY, 0, 1
    ]);

    // Apply rotation around Y axis (blob direction) and X axis (isometric tilt)
    const yAngle = -rotation + Math.PI / 2;

    // Isometric camera angle - tilt to see the face
    const isoTilt = Math.PI / 3; // 60 degrees from horizontal

    // Build rotation matrix: scale * translate * Rx_iso * Ry_direction * Rz_base
    // Base Z rotation (180°) to correct model orientation so it faces up
    const baseRotation = mat4FromRotationZ(Math.PI / 2);
    const yRotation = mat4FromRotationY(yAngle);
    const xRotation = mat4FromRotationX(isoTilt);
    const spinRotationX = mat4FromRotationX(spinAngle * 1.0);
    const spinRotationY = mat4FromRotationY(spinAngle * 0.25);
    const spinRotationZ = mat4FromRotationZ(spinAngle * 0.1);
    const scaleMatrix = mat4FromScaling(s, s, s);
    const translateMatrix = mat4FromTranslation(ndcX, ndcY, 0);

    // Combine: translate * scale * Rx * Ry * spinZ * spinX * Rz_base
    let rotatedMatrix = mat4Create();
    mat4Multiply(rotatedMatrix, spinRotationX, baseRotation);
    mat4Multiply(rotatedMatrix, spinRotationY, rotatedMatrix);
    mat4Multiply(rotatedMatrix, spinRotationZ, rotatedMatrix);
    mat4Multiply(rotatedMatrix, yRotation, rotatedMatrix);
    mat4Multiply(rotatedMatrix, xRotation, rotatedMatrix);
    mat4Multiply(rotatedMatrix, scaleMatrix, rotatedMatrix);
    mat4Multiply(rotatedMatrix, translateMatrix, rotatedMatrix);

    const viewMatrix = mat4Create();
    const projectionMatrix = mat4Create();

    const normalMatrix = mat3NormalFromMat4(rotatedMatrix);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_modelMatrix'), false, rotatedMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewMatrix'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_projectionMatrix'), false, projectionMatrix);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_normalMatrix'), false, normalMatrix);

    gl.uniform3fv(gl.getUniformLocation(program, 'u_lightDir'), [0.3, 0.8, 0.5]);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_ambientColor'), [0.4, 0.4, 0.4]);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_lightColor'), [0.7, 0.7, 0.7]);

    for (const mesh of model.meshes) {
      gl.bindVertexArray(mesh.vao);

      gl.uniform4fv(gl.getUniformLocation(program, 'u_baseColor'), mesh.baseColor);

      if (mesh.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
        gl.uniform1i(gl.getUniformLocation(program, 'u_hasTexture'), 1);
      } else {
        gl.uniform1i(gl.getUniformLocation(program, 'u_hasTexture'), 0);
      }

      if (mesh.hasIndices) {
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
      }
    }

    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
  }

  function isLoaded(name) {
    return name in loadedModels;
  }

  function createPreviewRenderer(canvas) {
    const previewGl = canvas.getContext('webgl2');
    if (!previewGl) {
      console.error('WebGL2 not supported for preview');
      return null;
    }

    const previewProgram = createProgramForContext(previewGl, vertexShaderSource, fragmentShaderSource);
    if (!previewProgram) return null;

    let previewModel = null;
    let previewRotation = 0;

    function createProgramForContext(ctx, vertexSource, fragmentSource) {
      function compileShaderForCtx(source, type) {
        const shader = ctx.createShader(type);
        ctx.shaderSource(shader, source);
        ctx.compileShader(shader);
        if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
          console.error('Preview shader compile error:', ctx.getShaderInfoLog(shader));
          ctx.deleteShader(shader);
          return null;
        }
        return shader;
      }

      const vertexShader = compileShaderForCtx(vertexSource, ctx.VERTEX_SHADER);
      const fragmentShader = compileShaderForCtx(fragmentSource, ctx.FRAGMENT_SHADER);
      const prog = ctx.createProgram();
      ctx.attachShader(prog, vertexShader);
      ctx.attachShader(prog, fragmentShader);
      ctx.linkProgram(prog);
      if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
        console.error('Preview program link error:', ctx.getProgramInfoLog(prog));
        return null;
      }
      return prog;
    }

    async function loadPreviewModel(name, url) {
      const gltfData = await GLTFLoader.load(url);

      previewModel = {
        meshes: [],
      };

      for (const meshData of gltfData.meshes) {
        const mesh = {
          vao: previewGl.createVertexArray(),
          indexCount: 0,
          hasIndices: false,
          vertexCount: 0,
          texture: null,
          baseColor: [1, 1, 1, 1],
        };

        previewGl.bindVertexArray(mesh.vao);

        if (meshData.positions) {
          const posBuffer = previewGl.createBuffer();
          previewGl.bindBuffer(previewGl.ARRAY_BUFFER, posBuffer);
          previewGl.bufferData(previewGl.ARRAY_BUFFER, meshData.positions, previewGl.STATIC_DRAW);
          const posLoc = previewGl.getAttribLocation(previewProgram, 'a_position');
          previewGl.enableVertexAttribArray(posLoc);
          previewGl.vertexAttribPointer(posLoc, 3, previewGl.FLOAT, false, 0, 0);
          mesh.vertexCount = meshData.positions.length / 3;
        }

        if (meshData.normals) {
          const normBuffer = previewGl.createBuffer();
          previewGl.bindBuffer(previewGl.ARRAY_BUFFER, normBuffer);
          previewGl.bufferData(previewGl.ARRAY_BUFFER, meshData.normals, previewGl.STATIC_DRAW);
          const normLoc = previewGl.getAttribLocation(previewProgram, 'a_normal');
          previewGl.enableVertexAttribArray(normLoc);
          previewGl.vertexAttribPointer(normLoc, 3, previewGl.FLOAT, false, 0, 0);
        }

        if (meshData.texCoords) {
          const texBuffer = previewGl.createBuffer();
          previewGl.bindBuffer(previewGl.ARRAY_BUFFER, texBuffer);
          previewGl.bufferData(previewGl.ARRAY_BUFFER, meshData.texCoords, previewGl.STATIC_DRAW);
          const texLoc = previewGl.getAttribLocation(previewProgram, 'a_texCoord');
          previewGl.enableVertexAttribArray(texLoc);
          previewGl.vertexAttribPointer(texLoc, 2, previewGl.FLOAT, false, 0, 0);
        }

        if (meshData.indices) {
          const indexBuffer = previewGl.createBuffer();
          previewGl.bindBuffer(previewGl.ELEMENT_ARRAY_BUFFER, indexBuffer);
          previewGl.bufferData(previewGl.ELEMENT_ARRAY_BUFFER, meshData.indices, previewGl.STATIC_DRAW);
          mesh.indexCount = meshData.indices.length;
          mesh.hasIndices = true;
          if (meshData.indices instanceof Uint32Array) {
            mesh.indexType = previewGl.UNSIGNED_INT;
          } else if (meshData.indices instanceof Uint16Array) {
            mesh.indexType = previewGl.UNSIGNED_SHORT;
          } else {
            mesh.indexType = previewGl.UNSIGNED_BYTE;
          }
        }

        if (meshData.material) {
          mesh.baseColor = meshData.material.baseColor;

          if (meshData.material.baseColorTexture) {
            mesh.texture = await loadPreviewTexture(meshData.material.baseColorTexture);
          }
        }

        previewGl.bindVertexArray(null);
        previewModel.meshes.push(mesh);
      }

      return previewModel;
    }

    function loadPreviewTexture(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const texture = previewGl.createTexture();
          previewGl.bindTexture(previewGl.TEXTURE_2D, texture);
          previewGl.pixelStorei(previewGl.UNPACK_FLIP_Y_WEBGL, false);
          previewGl.texImage2D(previewGl.TEXTURE_2D, 0, previewGl.RGBA, previewGl.RGBA, previewGl.UNSIGNED_BYTE, image);
          previewGl.texParameteri(previewGl.TEXTURE_2D, previewGl.TEXTURE_WRAP_S, previewGl.CLAMP_TO_EDGE);
          previewGl.texParameteri(previewGl.TEXTURE_2D, previewGl.TEXTURE_WRAP_T, previewGl.CLAMP_TO_EDGE);
          previewGl.texParameteri(previewGl.TEXTURE_2D, previewGl.TEXTURE_MIN_FILTER, previewGl.LINEAR_MIPMAP_LINEAR);
          previewGl.texParameteri(previewGl.TEXTURE_2D, previewGl.TEXTURE_MAG_FILTER, previewGl.LINEAR);
          previewGl.generateMipmap(previewGl.TEXTURE_2D);
          resolve(texture);
        };
        image.onerror = reject;
        image.src = url;
      });
    }

    function renderPreview(dt) {
      if (!previewModel) return;

      previewRotation += dt * 0.5;

      const width = canvas.width;
      const height = canvas.height;

      previewGl.viewport(0, 0, width, height);
      previewGl.clearColor(0.133, 0.133, 0.133, 1);
      previewGl.clear(previewGl.COLOR_BUFFER_BIT | previewGl.DEPTH_BUFFER_BIT);

      previewGl.useProgram(previewProgram);
      previewGl.enable(previewGl.DEPTH_TEST);
      previewGl.depthFunc(previewGl.LEQUAL);

      const scale = 2.8;
      const cosY = Math.cos(previewRotation);
      const sinY = Math.sin(previewRotation);

      const isoTilt = Math.PI / 6;
      const cosX = Math.cos(isoTilt);
      const sinX = Math.sin(isoTilt);

      const modelMatrix = new Float32Array([
        scale * cosY, scale * sinX * sinY, scale * cosX * sinY, 0,
        0, scale * cosX, -scale * sinX, 0,
        -scale * sinY, scale * sinX * cosY, scale * cosX * cosY, 0,
        0, 0, 0, 1
      ]);

      const viewMatrix = mat4Create();
      const projectionMatrix = mat4Create();
      const normalMatrix = mat3NormalFromMat4(modelMatrix);

      previewGl.uniformMatrix4fv(previewGl.getUniformLocation(previewProgram, 'u_modelMatrix'), false, modelMatrix);
      previewGl.uniformMatrix4fv(previewGl.getUniformLocation(previewProgram, 'u_viewMatrix'), false, viewMatrix);
      previewGl.uniformMatrix4fv(previewGl.getUniformLocation(previewProgram, 'u_projectionMatrix'), false, projectionMatrix);
      previewGl.uniformMatrix3fv(previewGl.getUniformLocation(previewProgram, 'u_normalMatrix'), false, normalMatrix);

      previewGl.uniform3fv(previewGl.getUniformLocation(previewProgram, 'u_lightDir'), [0.3, 0.8, 0.5]);
      previewGl.uniform3fv(previewGl.getUniformLocation(previewProgram, 'u_ambientColor'), [0.4, 0.4, 0.4]);
      previewGl.uniform3fv(previewGl.getUniformLocation(previewProgram, 'u_lightColor'), [0.7, 0.7, 0.7]);

      for (const mesh of previewModel.meshes) {
        previewGl.bindVertexArray(mesh.vao);
        previewGl.uniform4fv(previewGl.getUniformLocation(previewProgram, 'u_baseColor'), mesh.baseColor);

        if (mesh.texture) {
          previewGl.activeTexture(previewGl.TEXTURE0);
          previewGl.bindTexture(previewGl.TEXTURE_2D, mesh.texture);
          previewGl.uniform1i(previewGl.getUniformLocation(previewProgram, 'u_texture'), 0);
          previewGl.uniform1i(previewGl.getUniformLocation(previewProgram, 'u_hasTexture'), 1);
        } else {
          previewGl.uniform1i(previewGl.getUniformLocation(previewProgram, 'u_hasTexture'), 0);
        }

        if (mesh.hasIndices) {
          previewGl.drawElements(previewGl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
        } else {
          previewGl.drawArrays(previewGl.TRIANGLES, 0, mesh.vertexCount);
        }
      }

      previewGl.bindVertexArray(null);
      previewGl.disable(previewGl.DEPTH_TEST);
    }

    return {
      loadModel: loadPreviewModel,
      render: renderPreview,
    };
  }

  return {
    init,
    loadModel,
    render,
    isLoaded,
    createPreviewRenderer,
  };
})();
