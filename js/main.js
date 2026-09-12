// ===================== APP / UI CONTROLLER =====================

const screens = {};
document.querySelectorAll(".screen").forEach(el => screens[el.id] = el);

let currentGame = null;
let currentMode = null;

function showScreen(id) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[id].classList.remove("hidden");
}

function pushAds() {
  document.querySelectorAll(".adsbygoogle").forEach(ins => {
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ad blocked or not yet loaded */ }
  });
}

// ---------------- PWA: SERVICE WORKER ----------------
// sw.js is currently a "kill switch" that removes an earlier caching
// version which caused a stale-cache bug (see sw.js for the full story) —
// registering it here is what lets browsers pick up that cleanup.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed (harmless — app works fine without it):", err);
    });
  });
}

// ---------------- SPLASH ----------------
// DOMContentLoaded (not window.load) on purpose: 'load' waits for every
// image and external script (the ~300KB logo, the AdSense script, Firebase
// CDN files) to fully finish — on a slow mobile connection that can stay
// pending for several seconds, during which the splash looks frozen and
// people start impatiently tapping before anything is actually wired up.
// DOMContentLoaded fires as soon as this page's own HTML/JS is ready, which
// is all the menu buttons below actually need.
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    document.getElementById("splash-screen").classList.add("hidden");
    showScreen("main-menu");
    pushAds();
  }, 1800);
});

// ---------------- MAIN MENU ----------------
document.querySelectorAll(".menu-btn[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === "computer") startLocalGame("computer");
    else if (mode === "passplay") startLocalGame("passplay");
    else if (mode === "online") showScreen("online-lobby");
  });
});

document.querySelectorAll(".back-btn[data-back]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.id === "leave-room-btn") OnlineManager.leaveRoom();
    teardownGame();
    showScreen(btn.dataset.back);
  });
});

// ---------------- GAME SETUP (computer / pass & play) ----------------
function teardownGame() {
  if (currentGame) { currentGame.destroy(); currentGame = null; }
  document.getElementById("chat-panel").classList.add("hidden");
  document.getElementById("btn-toggle-chat").classList.add("hidden");
}

function startLocalGame(mode) {
  currentMode = mode;
  showScreen("game-screen");
  const canvas = document.getElementById("carrom-canvas");

  currentGame = new CarromGame(canvas, {
    mode,
    onTurnChange: ({ player, foul }) => updateTurnIndicator(mode, player, foul),
    onScoreChange: (scores) => updateScoreBox(scores),
    onGameOver: (result) => showGameOver(mode, result),
  });

  updateTurnIndicator(mode, 1, false);
  updateScoreBox({ 1: 0, 2: 0 });
  pushAds();
}

function labelForPlayer(mode, player) {
  if (mode === "computer") return player === 1 ? "Your Turn" : "Computer's Turn";
  if (mode === "passplay") return player === 1 ? "Player 1's Turn" : "Player 2's Turn";
  // online
  const myNum = OnlineManager.playerNum;
  return player === myNum ? "Your Turn" : "Opponent's Turn";
}

function updateTurnIndicator(mode, player, foul) {
  const el = document.getElementById("turn-indicator");
  el.textContent = (foul ? "Foul! — " : "") + labelForPlayer(mode, player);
}

function updateScoreBox(scores) {
  document.getElementById("score-a").textContent = "P1: " + scores[1];
  document.getElementById("score-b").textContent = "P2: " + scores[2];
}

function showGameOver(mode, result) {
  const title = document.getElementById("gameover-title");
  const text = document.getElementById("gameover-text");
  if (result.winner === 0) {
    title.textContent = "It's a Draw!";
  } else if (mode === "computer") {
    title.textContent = result.winner === 1 ? "You Win! 🏆" : "Computer Wins";
  } else if (mode === "online") {
    const myNum = OnlineManager.playerNum;
    title.textContent = result.winner === myNum ? "You Win! 🏆" : "You Lose";
  } else {
    title.textContent = "Player " + result.winner + " Wins! 🏆";
  }
  text.textContent = `Final Score — P1: ${result.scores[1]}  |  P2: ${result.scores[2]}`;
  document.getElementById("gameover-modal").classList.remove("hidden");
}

document.getElementById("btn-play-again").addEventListener("click", () => {
  document.getElementById("gameover-modal").classList.add("hidden");
  if (currentMode === "online") {
    // Online rematch isn't wired up yet — instead of leaving the player
    // stuck staring at a frozen board, send them back to the menu.
    teardownGame();
    OnlineManager.leaveRoom();
    showScreen("main-menu");
    return;
  }
  startLocalGame(currentMode);
});
document.getElementById("btn-back-menu").addEventListener("click", () => {
  document.getElementById("gameover-modal").classList.add("hidden");
  teardownGame();
  OnlineManager.leaveRoom();
  showScreen("main-menu");
});
document.getElementById("btn-quit-game").addEventListener("click", () => {
  teardownGame();
  OnlineManager.leaveRoom();
  showScreen("main-menu");
});

// ---------------- POWER SLIDER ----------------
document.getElementById("power-slider").addEventListener("input", (e) => {
  if (currentGame) currentGame.setPowerMultiplier(e.target.value / 100);
});

// ---------------- ONLINE LOBBY ----------------
const lobbyStatus = document.getElementById("lobby-status");

document.getElementById("btn-create-room").addEventListener("click", async () => {
  lobbyStatus.textContent = "Creating room...";
  try {
    const code = await OnlineManager.createRoom();
    document.getElementById("room-code-display").textContent = code;
    document.getElementById("waiting-players").textContent = "Waiting for opponent to join...";
    document.getElementById("btn-start-online-game").classList.add("hidden");
    showScreen("online-waiting");

    OnlineManager.watchRoom({
      onGuestJoined: () => {
        document.getElementById("waiting-players").textContent = "Opponent joined! Ready to start.";
        document.getElementById("btn-start-online-game").classList.remove("hidden");
      },
      onGameStart: () => beginOnlineGame(1),
    });
  } catch (err) {
    lobbyStatus.textContent = "Could not create room. Check Firebase setup.";
    console.error(err);
  }
});

document.getElementById("btn-join-room").addEventListener("click", async () => {
  const code = document.getElementById("join-code-input").value.trim();
  if (!/^\d{4,6}$/.test(code)) { lobbyStatus.textContent = "Enter a valid numeric room code."; return; }
  lobbyStatus.textContent = "Joining...";
  try {
    const res = await OnlineManager.joinRoom(code);
    if (!res.ok) {
      lobbyStatus.textContent = res.reason === "full" ? "Room is full." : "Room not found.";
      return;
    }
    document.getElementById("room-code-display").textContent = code;
    document.getElementById("waiting-players").textContent = "Waiting for host to start the game...";
    document.getElementById("btn-start-online-game").classList.add("hidden");
    showScreen("online-waiting");
    OnlineManager.watchRoom({ onGameStart: () => beginOnlineGame(2) });
  } catch (err) {
    lobbyStatus.textContent = "Could not join room. Check Firebase setup.";
    console.error(err);
  }
});

document.getElementById("btn-start-online-game").addEventListener("click", () => {
  OnlineManager.startGame();
});

function beginOnlineGame(myPlayerNum) {
  currentMode = "online";
  showScreen("game-screen");
  document.getElementById("btn-toggle-chat").classList.remove("hidden");

  const canvas = document.getElementById("carrom-canvas");
  currentGame = new CarromGame(canvas, {
    mode: "online",
    myPlayerNum,
    onTurnChange: ({ player, foul }) => updateTurnIndicator("online", player, foul),
    onScoreChange: (scores) => updateScoreBox(scores),
    onGameOver: (result) => showGameOver("online", result),
    onShotFired: (shot) => OnlineManager.sendShot(shot.vx, shot.vy, shot.x, shot.y),
  });

  OnlineManager.watchShots((shot) => {
    currentGame.fireRemoteShot(shot.vx, shot.vy, shot.x, shot.y);
  });

  setupChat();
  updateTurnIndicator("online", 1, false);
  updateScoreBox({ 1: 0, 2: 0 });
  pushAds();
}

// ---------------- CHAT ----------------
function setupChat() {
  const messagesEl = document.getElementById("chat-messages");
  messagesEl.innerHTML = "";
  OnlineManager.watchChat((msg) => {
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "chat-msg" + (msg.isMine ? " me" : "");
    div.innerHTML = `<span class="who">${msg.who}:</span>${escapeHtml(msg.text)}`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

document.getElementById("btn-toggle-chat").addEventListener("click", () => {
  document.getElementById("chat-panel").classList.toggle("hidden");
});
document.getElementById("chat-close-btn").addEventListener("click", () => {
  document.getElementById("chat-panel").classList.add("hidden");
});
document.getElementById("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  OnlineManager.sendChat(text);
  input.value = "";
});

// ---------------- SETTINGS ----------------
document.getElementById("btn-settings").addEventListener("click", () => {
  document.getElementById("toggle-sound").checked = Settings.soundOn;

  const vibToggle = document.getElementById("toggle-vibration");
  const vibNote = document.getElementById("vibration-note");
  if (navigator.vibrate) {
    vibToggle.disabled = false;
    vibToggle.checked = Settings.vibrationOn;
    vibNote.classList.add("hidden");
  } else {
    vibToggle.disabled = true;
    vibToggle.checked = false;
    vibNote.classList.remove("hidden");
  }

  document.getElementById("settings-modal").classList.remove("hidden");
});
document.getElementById("btn-close-settings").addEventListener("click", () => {
  document.getElementById("settings-modal").classList.add("hidden");
});
document.getElementById("toggle-sound").addEventListener("change", (e) => {
  Settings.setSound(e.target.checked);
});
document.getElementById("toggle-vibration").addEventListener("change", (e) => {
  Settings.setVibration(e.target.checked);
});
