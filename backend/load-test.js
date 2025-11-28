/**
 * Load Test Script for Blob Compete Server
 * Simulates N concurrent players with random actions
 *
 * Usage: node load-test.js [options]
 *   --players     Number of concurrent players (default: 400)
 *   --ramp-rate   Players to add per second (default: 50)
 *   --duration    Test duration in seconds (default: 60)
 *   --action-rate Actions per second per player (default: 10)
 */

const WebSocket = require("ws");

// Configuration with defaults
const CONFIG = {
  target: "ws://localhost:3000",
  players: 400,
  rampRate: 50,
  duration: 60,
  actionRate: 10,
};

// Parse CLI args
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace("--", "");
  const value = process.argv[i + 1];
  if (key in CONFIG) {
    CONFIG[key] = key === "target" ? value : parseInt(value, 10);
  }
}

// Metrics
const metrics = {
  connectionsAttempted: 0,
  connectionsSucceeded: 0,
  connectionsFailed: 0,
  messagesReceived: 0,
  messagesSent: 0,
  bytesReceived: 0,
  bytesSent: 0,
  latencies: [],
  errors: [],
  startTime: null,
};

// Active connections
const clients = new Map();
const characters = ["mats", "krille", "tommi", "per", "linda"];

function generateToken() {
  return `loadtest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function getRandomCharacter() {
  return characters[Math.floor(Math.random() * characters.length)];
}

function getRandomAction() {
  return Math.floor(Math.random() * 3); // 0=right, 1=left, 2=straight
}

class LoadTestClient {
  constructor(id) {
    this.id = id;
    this.ws = null;
    this.connected = false;
    this.blobIndex = -1;
    this.actionInterval = null;
    this.pingInterval = null;
  }

  connect() {
    metrics.connectionsAttempted++;
    const token = generateToken();
    const character = getRandomCharacter();
    const url = `${CONFIG.target}/ws/play?character=${character}&token=${token}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      metrics.connectionsFailed++;
      metrics.errors.push({ id: this.id, error: err.message });
      return;
    }

    this.ws.on("open", () => {
      this.connected = true;
      metrics.connectionsSucceeded++;
      this.startActions();
      this.startPing();
    });

    this.ws.on("message", (data) => {
      metrics.messagesReceived++;
      metrics.bytesReceived += data.length;

      try {
        const msg = JSON.parse(data);
        if (msg.type === "init") {
          this.blobIndex = msg.yourBlobIndex;
        } else if (msg.type === "pong") {
          const latency = Date.now() - msg.timestamp;
          metrics.latencies.push(latency);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    this.ws.on("error", (err) => {
      metrics.connectionsFailed++;
      metrics.errors.push({ id: this.id, error: err.message });
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.stopActions();
      this.stopPing();
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(msg);
      this.ws.send(data);
      metrics.messagesSent++;
      metrics.bytesSent += data.length;
    }
  }

  startActions() {
    const interval = 1000 / CONFIG.actionRate;
    this.actionInterval = setInterval(() => {
      this.send({ type: "action", action: getRandomAction() });
    }, interval);
  }

  stopActions() {
    if (this.actionInterval) {
      clearInterval(this.actionInterval);
      this.actionInterval = null;
    }
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping", timestamp: Date.now() });
    }, 5000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.stopActions();
    this.stopPing();
    if (this.ws) {
      this.ws.close();
    }
  }
}

function displayMetrics() {
  const elapsed = (Date.now() - metrics.startTime) / 1000;
  const activeClients = Array.from(clients.values()).filter(
    (c) => c.connected
  ).length;

  // Calculate latency stats
  let avgLatency = 0,
    p95Latency = 0,
    p99Latency = 0;
  if (metrics.latencies.length > 0) {
    const sorted = [...metrics.latencies].sort((a, b) => a - b);
    avgLatency = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    p95Latency = sorted[Math.floor(sorted.length * 0.95)] || 0;
    p99Latency = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  console.clear();
  console.log("=== Load Test Metrics ===");
  console.log(`Target: ${CONFIG.target}`);
  console.log(`Elapsed: ${elapsed.toFixed(1)}s / ${CONFIG.duration}s`);
  console.log("");
  console.log("Connections:");
  console.log(`  Active:    ${activeClients} / ${CONFIG.players}`);
  console.log(`  Attempted: ${metrics.connectionsAttempted}`);
  console.log(`  Succeeded: ${metrics.connectionsSucceeded}`);
  console.log(`  Failed:    ${metrics.connectionsFailed}`);
  console.log("");
  console.log("Messages:");
  console.log(
    `  Sent:     ${metrics.messagesSent} (${(metrics.bytesSent / 1024).toFixed(1)} KB)`
  );
  console.log(
    `  Received: ${metrics.messagesReceived} (${(metrics.bytesReceived / 1024 / 1024).toFixed(2)} MB)`
  );
  console.log("");
  console.log("Latency (ping-pong):");
  console.log(`  Avg:  ${avgLatency.toFixed(1)} ms`);
  console.log(`  P95:  ${p95Latency.toFixed(1)} ms`);
  console.log(`  P99:  ${p99Latency.toFixed(1)} ms`);
  console.log("");
  if (metrics.errors.length > 0) {
    console.log(`Errors: ${metrics.errors.length}`);
    const lastError = metrics.errors[metrics.errors.length - 1];
    console.log(`  Last: ${lastError?.error}`);
  }
}

async function runTest() {
  console.log("Starting load test...");
  console.log(JSON.stringify(CONFIG, null, 2));
  console.log("");

  metrics.startTime = Date.now();

  // Ramp up connections
  const rampInterval = 1000 / CONFIG.rampRate;
  let clientId = 0;

  const rampTimer = setInterval(() => {
    if (clientId >= CONFIG.players) {
      clearInterval(rampTimer);
      return;
    }

    const client = new LoadTestClient(clientId);
    clients.set(clientId, client);
    client.connect();
    clientId++;
  }, rampInterval);

  // Display metrics periodically
  const displayTimer = setInterval(displayMetrics, 1000);

  // Run for duration
  await new Promise((resolve) => setTimeout(resolve, CONFIG.duration * 1000));

  // Cleanup
  clearInterval(rampTimer);
  clearInterval(displayTimer);

  console.log("\nClosing connections...");
  for (const client of clients.values()) {
    client.disconnect();
  }

  // Final report
  await new Promise((resolve) => setTimeout(resolve, 1000));
  displayMetrics();
  console.log("\n=== Test Complete ===");
}

runTest().catch(console.error);
