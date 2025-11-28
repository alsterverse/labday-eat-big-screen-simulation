/**
 * Binary Protocol for efficient state transmission
 *
 * Message format for state (type 0x01):
 * - 1 byte: message type
 * - 4 bytes: mapSize (float32)
 * - 4 bytes: agentRadius (float32)
 * - 2 bytes: blob count (uint16)
 * - Per blob (19 bytes):
 *   - 4 bytes: x (float32)
 *   - 4 bytes: y (float32)
 *   - 4 bytes: angle (float32)
 *   - 4 bytes: mass (float32)
 *   - 2 bytes: foodsCollected (uint16)
 *   - 1 byte: flags (bit 0: alive, bit 1: aiControlled)
 * - 2 bytes: food count (uint16)
 * - Per food (8 bytes):
 *   - 4 bytes: x (float32)
 *   - 4 bytes: y (float32)
 */

const MSG_TYPE_STATE = 0x01;

// Character name to ID mapping
const CHARACTER_IDS = {
  'mats': 0,
  'krille': 1,
  'tommi': 2,
  'per': 3,
  'linda': 4,
};

// Pre-allocate buffer for max expected size (500 blobs + 100 foods)
// Header: 1 + 4 + 4 + 2 = 11 bytes
// Blobs: 500 * 19 = 9500 bytes
// Food header: 2 bytes
// Foods: 100 * 8 = 800 bytes
// Total: ~10313 bytes max
const MAX_BUFFER_SIZE = 12000;
const sharedBuffer = Buffer.alloc(MAX_BUFFER_SIZE);

function encodeState(state) {
  const { blobs, foods, mapSize, agentRadius } = state;

  let offset = 0;

  // Message type
  sharedBuffer.writeUInt8(MSG_TYPE_STATE, offset);
  offset += 1;

  // Map size and agent radius
  sharedBuffer.writeFloatLE(mapSize, offset);
  offset += 4;
  sharedBuffer.writeFloatLE(agentRadius, offset);
  offset += 4;

  // Blob count
  const blobCount = blobs.length;
  sharedBuffer.writeUInt16LE(blobCount, offset);
  offset += 2;

  // Blobs
  for (let i = 0; i < blobCount; i++) {
    const blob = blobs[i];

    sharedBuffer.writeFloatLE(blob.x, offset);
    offset += 4;
    sharedBuffer.writeFloatLE(blob.y, offset);
    offset += 4;
    sharedBuffer.writeFloatLE(blob.angle, offset);
    offset += 4;
    sharedBuffer.writeFloatLE(blob.mass, offset);
    offset += 4;
    sharedBuffer.writeUInt16LE(blob.foodsCollected || 0, offset);
    offset += 2;

    // Flags: bit 0 = alive, bit 1 = aiControlled, bits 4-7 = character ID
    let flags = 0;
    if (blob.alive) flags |= 0x01;
    if (blob.aiControlled) flags |= 0x02;
    const charId = CHARACTER_IDS[blob.character] ?? 0x0F; // 0x0F = no character
    flags |= (charId << 4);
    sharedBuffer.writeUInt8(flags, offset);
    offset += 1;
  }

  // Food count
  const foodCount = foods.length;
  sharedBuffer.writeUInt16LE(foodCount, offset);
  offset += 2;

  // Foods
  for (let i = 0; i < foodCount; i++) {
    const food = foods[i];
    sharedBuffer.writeFloatLE(food.x, offset);
    offset += 4;
    sharedBuffer.writeFloatLE(food.y, offset);
    offset += 4;
  }

  // Return a slice of the buffer with actual data
  return sharedBuffer.slice(0, offset);
}

module.exports = {
  encodeState,
  MSG_TYPE_STATE,
  CHARACTER_IDS,
};
