/**
 * UI Overlay Module
 * Manages the stats panel and controls display
 */

const UI = (function () {
  let elements = {};

  /**
   * Initialize UI elements
   */
  function init() {
    elements = {
      episode: document.getElementById("episode"),
      steps: document.getElementById("steps"),
      blob1Wins: document.getElementById("blob1-wins"),
      blob2Wins: document.getElementById("blob2-wins"),
      blob1Trophies: document.getElementById("blob1-trophies"),
      blob2Trophies: document.getElementById("blob2-trophies"),
      blob1Mass: document.getElementById("blob1-mass"),
      blob2Mass: document.getElementById("blob2-mass"),
      blob1Foods: document.getElementById("blob1-foods"),
      blob2Foods: document.getElementById("blob2-foods"),
      status: document.getElementById("status"),
      pauseIndicator: document.getElementById("pause-indicator"),
    };
  }

  /**
   * Create trophy icons HTML
   */
  function createTrophies(count) {
    let html = "";
    for (let i = 0; i < Math.min(count, 20); i++) {
      html += '<img src="assets/trophy.png" class="trophy" alt="trophy">';
    }
    if (count > 20) {
      html += `<span class="trophy-overflow">+${count - 20}</span>`;
    }
    return html;
  }

  /**
   * Update UI with current stats
   */
  function update(stats) {
    if (!elements.episode) return;

    elements.episode.textContent = `Episode ${stats.episode}`;
    elements.steps.textContent = `Step: ${stats.steps} / ${stats.maxSteps}`;

    elements.blob1Wins.textContent = stats.wins[0];
    elements.blob2Wins.textContent = stats.wins[1];

    elements.blob1Trophies.innerHTML = createTrophies(stats.wins[0]);
    elements.blob2Trophies.innerHTML = createTrophies(stats.wins[1]);

    elements.blob1Mass.textContent = stats.blobs[0].mass.toFixed(2);
    elements.blob2Mass.textContent = stats.blobs[1].mass.toFixed(2);

    elements.blob1Foods.textContent = stats.blobs[0].foodsCollected;
    elements.blob2Foods.textContent = stats.blobs[1].foodsCollected;

    // Status
    if (stats.terminated) {
      if (stats.winner === 0) {
        elements.status.textContent = "BLOB 1 WINS!";
        elements.status.className = "status blob1-color";
      } else if (stats.winner === 1) {
        elements.status.textContent = "BLOB 2 WINS!";
        elements.status.className = "status blob2-color";
      } else {
        elements.status.textContent = "DRAW!";
        elements.status.className = "status";
      }
    } else {
      elements.status.textContent = "COMPETING...";
      elements.status.className = "status competing";
    }
  }

  /**
   * Show/hide pause indicator
   */
  function setPaused(paused) {
    if (elements.pauseIndicator) {
      elements.pauseIndicator.style.display = paused ? "block" : "none";
    }
  }

  return {
    init,
    update,
    setPaused,
  };
})();
