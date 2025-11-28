/**
 * Visitor Token - Server-signed tokens for spam bot prevention
 *
 * Tokens are issued when visiting the spectator page and required to join as a player.
 * Format: {timestamp}.{signature}
 */

const crypto = require("crypto");

// Generate a random secret on server start (session-only tokens)
const SECRET = crypto.randomBytes(32).toString("hex");

/**
 * Generate a signed visitor token
 * @returns {string} Token in format "timestamp.signature"
 */
function generateVisitorToken() {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

/**
 * Validate a visitor token
 * @param {string} token - Token to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateVisitorToken(token) {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [timestamp, signature] = parts;

  // Verify timestamp is a valid number
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    return false;
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(timestamp)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

module.exports = {
  generateVisitorToken,
  validateVisitorToken,
};
