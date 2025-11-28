/**
 * Binary Protocol Decoder for client-side
 * Decodes binary state messages from server
 */

const BinaryProtocol = (function () {
  const MSG_TYPE_STATE = 0x01;

  // Character ID to name mapping
  const CHARACTER_NAMES = ['mats', 'krille', 'tommi', 'per', 'linda'];

  function decodeState(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    // Message type
    const msgType = view.getUint8(offset);
    offset += 1;

    if (msgType !== MSG_TYPE_STATE) {
      return null; // Unknown message type
    }

    // Map size and agent radius
    const mapSize = view.getFloat32(offset, true);
    offset += 4;
    const agentRadius = view.getFloat32(offset, true);
    offset += 4;

    // Blob count
    const blobCount = view.getUint16(offset, true);
    offset += 2;

    // Blobs
    const blobs = [];
    for (let i = 0; i < blobCount; i++) {
      const x = view.getFloat32(offset, true);
      offset += 4;
      const y = view.getFloat32(offset, true);
      offset += 4;
      const angle = view.getFloat32(offset, true);
      offset += 4;
      const mass = view.getFloat32(offset, true);
      offset += 4;
      const foodsCollected = view.getUint16(offset, true);
      offset += 2;
      const flags = view.getUint8(offset);
      offset += 1;

      const alive = (flags & 0x01) !== 0;
      const aiControlled = (flags & 0x02) !== 0;
      const charId = (flags >> 4) & 0x0F;
      const character = charId < CHARACTER_NAMES.length ? CHARACTER_NAMES[charId] : null;

      blobs.push({
        x,
        y,
        angle,
        mass,
        foodsCollected,
        alive,
        aiControlled,
        character,
      });
    }

    // Food count
    const foodCount = view.getUint16(offset, true);
    offset += 2;

    // Foods
    const foods = [];
    for (let i = 0; i < foodCount; i++) {
      const x = view.getFloat32(offset, true);
      offset += 4;
      const y = view.getFloat32(offset, true);
      offset += 4;

      foods.push({ x, y });
    }

    return {
      blobs,
      foods,
      mapSize,
      agentRadius,
    };
  }

  function isBinaryMessage(data) {
    return data instanceof ArrayBuffer;
  }

  return {
    decodeState,
    isBinaryMessage,
    MSG_TYPE_STATE,
  };
})();
