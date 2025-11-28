/**
 * UI Overlay Module (Client Version)!
 */

const UI = (function () {
  let elements = {};

  function init() {
    elements = {
      episode: document.getElementById("episode"),
      steps: document.getElementById("steps"),
      leaderboard: document.getElementById("leaderboard"),
      status: document.getElementById("status"),
      modeIndicator: document.getElementById("mode-indicator"),
      playerSection: document.getElementById("player-section"),
      playerMass: document.getElementById("player-mass"),
      playerFoods: document.getElementById("player-foods"),
      connectionStatus: document.getElementById("connection-status"),
      modeToggle: document.getElementById("mode-toggle"),
      topPlayersList: document.getElementById("top-players-list"),
    };
  }

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

  function update(stats, playerBlobIndex) {
    if (!elements.episode || !stats) return;

    elements.episode.textContent = `Episode ${stats.episode}`;
    elements.steps.textContent = `Step: ${stats.steps} / ${stats.maxSteps}`;

    // Create leaderboard sorted by food collected (descending)
    if (elements.leaderboard && stats.blobs) {
      const sorted = stats.blobs
        .map((blob, index) => ({
          index,
          name: blob.aiControlled ? `AI ${index + 1}` : (blob.character || `Player ${index + 1}`),
          foods: blob.foodsCollected || 0,
          character: blob.character,
          aiControlled: blob.aiControlled,
          icon: blob.character ? `assets/players/${blob.character}.png` : `assets/blob${(index % 2) + 1}.png`
        }))
        .sort((a, b) => b.foods - a.foods);

      let leaderboardHTML = '';
      sorted.forEach((blob, rank) => {
        const rankClass = rank === 0 ? 'first' : rank === 1 ? 'second' : rank === 2 ? 'third' : '';
        const isPlayer = blob.index === playerBlobIndex;
        const playerArrow = isPlayer ? '<span class="player-arrow">➤</span>' : '';
        const rowClass = isPlayer ? 'leaderboard-row player-row' : 'leaderboard-row';

        leaderboardHTML += `
          <div class="${rowClass}">
            ${playerArrow}
            <span class="leaderboard-rank ${rankClass}">${rank + 1}</span>
            <img src="${blob.icon}" class="leaderboard-icon" alt="${blob.name}">
            <span class="leaderboard-name">${blob.name}</span>
            <span class="leaderboard-food">
              <img src="assets/food.png" class="leaderboard-food-icon" alt="food">
              ${blob.foods}
            </span>
          </div>
        `;
      });
      elements.leaderboard.innerHTML = leaderboardHTML;

      // Update top 3 players for mobile overlay
      if (elements.topPlayersList) {
        const top3 = sorted.slice(0, 3);
        let top3HTML = '';
        top3.forEach((blob, rank) => {
          const rankClass = rank === 0 ? 'first' : rank === 1 ? 'second' : 'third';
          const rankLabel = rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉';

          top3HTML += `
            <div class="top-player">
              <span class="top-player-rank ${rankClass}">${rankLabel}</span>
              <img src="${blob.icon}" class="top-player-icon" alt="${blob.name}">
              <span class="top-player-name">${blob.name}</span>
              <span class="top-player-food">
                <img src="assets/food.png" class="top-player-food-icon" alt="food">
                ${blob.foods}
              </span>
            </div>
          `;
        });
        elements.topPlayersList.innerHTML = top3HTML;
      }
    }

    if (elements.playerSection && playerBlobIndex !== -1 && stats.blobs[playerBlobIndex]) {
      elements.playerSection.style.display = "block";
      elements.playerMass.textContent = stats.blobs[playerBlobIndex].mass?.toFixed(2) || "0.00";
      elements.playerFoods.textContent = stats.blobs[playerBlobIndex].foodsCollected || 0;
    } else if (elements.playerSection) {
      elements.playerSection.style.display = "none";
    }

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

  function setPlayerMode(playing) {
    if (elements.modeIndicator) {
      if (playing) {
        elements.modeIndicator.textContent = "Playing";
        elements.modeIndicator.className = "mode-indicator player-color";
      } else {
        elements.modeIndicator.textContent = "Spectator Mode";
        elements.modeIndicator.className = "mode-indicator";
      }
    }
  }

  function setConnectionStatus(connected) {
    if (elements.connectionStatus) {
      if (connected) {
        elements.connectionStatus.textContent = "Connected";
        elements.connectionStatus.className = "connection-status connected";
      } else {
        elements.connectionStatus.textContent = "Disconnected";
        elements.connectionStatus.className = "connection-status disconnected";
      }
    }
  }

  function updateModeToggle(isPlayerMode) {
    if (elements.modeToggle) {
      if (isPlayerMode) {
        elements.modeToggle.textContent = "Switch to Spectator";
        elements.modeToggle.className = "mode-toggle spectate";
      } else {
        elements.modeToggle.textContent = "Join as Player";
        elements.modeToggle.className = "mode-toggle";
      }
    }
  }

  return {
    init,
    update,
    setPlayerMode,
    setConnectionStatus,
    updateModeToggle,
  };
})();
