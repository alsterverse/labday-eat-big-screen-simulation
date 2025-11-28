/**
 * Minimal GLTF/GLB Loader for WebGL2
 * Loads binary GLTF files and extracts mesh data for rendering
 */

const GLTFLoader = (function () {
  const GLTF_MAGIC = 0x46546C67; // 'glTF'
  const CHUNK_TYPE_JSON = 0x4E4F534A; // 'JSON'
  const CHUNK_TYPE_BIN = 0x004E4942; // 'BIN\0'

  async function load(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return parseGLB(buffer);
  }

  function parseGLB(buffer) {
    const dataView = new DataView(buffer);
    let offset = 0;

    const magic = dataView.getUint32(offset, true);
    offset += 4;
    if (magic !== GLTF_MAGIC) {
      throw new Error('Invalid GLB magic number');
    }

    const version = dataView.getUint32(offset, true);
    offset += 4;
    if (version !== 2) {
      throw new Error('Unsupported GLTF version: ' + version);
    }

    const length = dataView.getUint32(offset, true);
    offset += 4;

    let jsonChunk = null;
    let binChunk = null;

    while (offset < length) {
      const chunkLength = dataView.getUint32(offset, true);
      offset += 4;
      const chunkType = dataView.getUint32(offset, true);
      offset += 4;

      if (chunkType === CHUNK_TYPE_JSON) {
        const jsonBytes = new Uint8Array(buffer, offset, chunkLength);
        const jsonString = new TextDecoder().decode(jsonBytes);
        jsonChunk = JSON.parse(jsonString);
      } else if (chunkType === CHUNK_TYPE_BIN) {
        binChunk = buffer.slice(offset, offset + chunkLength);
      }

      offset += chunkLength;
    }

    if (!jsonChunk) {
      throw new Error('No JSON chunk found in GLB');
    }

    return extractMeshData(jsonChunk, binChunk);
  }

  function extractMeshData(gltf, binBuffer) {
    const meshes = [];

    if (!gltf.meshes || gltf.meshes.length === 0) {
      throw new Error('No meshes found in GLTF');
    }

    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const meshData = {
          positions: null,
          normals: null,
          texCoords: null,
          indices: null,
          material: null,
        };

        if (primitive.attributes.POSITION !== undefined) {
          meshData.positions = getAccessorData(gltf, binBuffer, primitive.attributes.POSITION);
        }

        if (primitive.attributes.NORMAL !== undefined) {
          meshData.normals = getAccessorData(gltf, binBuffer, primitive.attributes.NORMAL);
        }

        if (primitive.attributes.TEXCOORD_0 !== undefined) {
          meshData.texCoords = getAccessorData(gltf, binBuffer, primitive.attributes.TEXCOORD_0);
        }

        if (primitive.indices !== undefined) {
          meshData.indices = getAccessorData(gltf, binBuffer, primitive.indices);
        }

        if (primitive.material !== undefined && gltf.materials) {
          const material = gltf.materials[primitive.material];
          meshData.material = extractMaterial(gltf, binBuffer, material);
        }

        meshes.push(meshData);
      }
    }

    return { meshes, gltf, binBuffer };
  }

  function extractMaterial(gltf, binBuffer, material) {
    const result = {
      baseColor: [1, 1, 1, 1],
      baseColorTexture: null,
    };

    if (material.pbrMetallicRoughness) {
      const pbr = material.pbrMetallicRoughness;

      if (pbr.baseColorFactor) {
        result.baseColor = pbr.baseColorFactor;
      }

      if (pbr.baseColorTexture !== undefined) {
        const textureIndex = pbr.baseColorTexture.index;
        result.baseColorTexture = extractTexture(gltf, binBuffer, textureIndex);
      }
    }

    return result;
  }

  function extractTexture(gltf, binBuffer, textureIndex) {
    const texture = gltf.textures[textureIndex];
    const imageIndex = texture.source;
    const image = gltf.images[imageIndex];

    if (image.bufferView !== undefined) {
      const bufferView = gltf.bufferViews[image.bufferView];
      const byteOffset = bufferView.byteOffset || 0;
      const byteLength = bufferView.byteLength;
      const imageData = new Uint8Array(binBuffer, byteOffset, byteLength);
      const blob = new Blob([imageData], { type: image.mimeType || 'image/png' });
      return URL.createObjectURL(blob);
    }

    return image.uri || null;
  }

  function getAccessorData(gltf, binBuffer, accessorIndex) {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];

    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);

    const componentTypeMap = {
      5120: Int8Array,
      5121: Uint8Array,
      5122: Int16Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array,
    };

    const typeCountMap = {
      'SCALAR': 1,
      'VEC2': 2,
      'VEC3': 3,
      'VEC4': 4,
      'MAT2': 4,
      'MAT3': 9,
      'MAT4': 16,
    };

    const TypedArrayClass = componentTypeMap[accessor.componentType];
    const componentCount = typeCountMap[accessor.type];
    const elementCount = accessor.count * componentCount;

    return new TypedArrayClass(binBuffer, byteOffset, elementCount);
  }

  return { load };
})();
