// ===================== CARROM BOARD / GAME LOGIC =====================
// Handles: coin layout, rendering, striker input (drag-to-shoot),
// turn switching, simplified scoring & queen rules.
//
// Simplified rule set (kept intentionally light for a casual web game):
//  - Player (You) = WHITE coins, Opponent = BLACK coins (fixed, not decided by first pot)
//  - Pocket your own color -> go again. Pocket opponent color / nothing -> turn passes.
//  - Pocket the Queen (red) -> must pocket one more OWN coin before turn ends,
//    otherwise the Queen returns to the center on next stoppage.
//  - Pocket the striker itself -> foul, turn passes immediately.
//  - Game ends when all 9 white + 9 black coins are pocketed.

class CarromGame {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.size = canvas.width; // square board, logical units (matches width attr)
    this.margin = this.size * 0.09;
    this.pocketR = this.size * 0.05;

    this.world = {
      minX: this.margin, minY: this.margin,
      maxX: this.size - this.margin, maxY: this.size - this.margin,
      pockets: [
        { x: this.margin, y: this.margin },
        { x: this.size - this.margin, y: this.margin },
        { x: this.margin, y: this.size - this.margin },
        { x: this.size - this.margin, y: this.size - this.margin },
      ].map(p => ({ ...p, r: this.pocketR }))
    };

    this.coinR = this.size * 0.028;
    this.strikerR = this.size * 0.034;

    this.mode = opts.mode || "computer";       // computer | passplay | online
    this.onTurnChange = opts.onTurnChange || (() => {});
    this.onScoreChange = opts.onScoreChange || (() => {});
    this.onGameOver = opts.onGameOver || (() => {});
    this.onShotFired = opts.onShotFired || (() => {}); // for online sync: (shot) => {}
    this.isRemoteControlled = opts.isRemoteControlled || false; // true = wait for network updates instead of local physics authority

    this.currentPlayer = 1; // 1 = You / Host, 2 = Opponent / Guest
    this._myPlayerNum = opts.myPlayerNum || null; // online only: which player THIS device controls
    this.scores = { 1: 0, 2: 0 };
    this.queenPocketed = false;
    this.queenOwner = null;
    this.queenNeedsCover = false;
    this.gameOver = false;
    this.inputEnabled = true;
    this.aiming = false;
    this.aimStart = null;
    this.aimCurrent = null;
    this.powerMultiplier = 0.6;

    this._setupBodies();
    this._bindInput();
    this._raf = null;
    this._loop = this._loop.bind(this);
    this._loop();
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._aiTimeout) clearTimeout(this._aiTimeout);
    this._unbindInput();
  }

  setPowerMultiplier(v) { this.powerMultiplier = v; }

  _setupBodies() {
    const cx = this.size / 2, cy = this.size / 2;
    const bodies = [];
    let id = 0;

    // Queen in the very center
    bodies.push(Physics.createBody({ x: cx, y: cy, r: this.coinR, color: "#d32f2f", type: "queen", id: id++ }));

    // Ring of alternating white/black around the queen (simplified hex-ish ring, 8 coins)
    // NOTE: radius must be large enough that neighbouring coins don't start overlapping
    // (8 coins need centre-distance >= coinR / sin(22.5deg) ~= 2.61*coinR) — 2.7 keeps a
    // small safety gap so the physics engine doesn't fling coins apart on the first shot.
    const ringR = this.coinR * 2.7;
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const color = i % 2 === 0 ? "#f5f5f5" : "#1a1a1a";
      const type = i % 2 === 0 ? "white" : "black";
      bodies.push(Physics.createBody({
        x: cx + Math.cos(angle) * ringR,
        y: cy + Math.sin(angle) * ringR,
        r: this.coinR, color, type, id: id++
      }));
    }

    // Outer ring, 10 coins (5 white, 5 black) to total 9+9
    const ringR2 = this.coinR * 4.75;
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.PI / 10;
      const color = i % 2 === 0 ? "#1a1a1a" : "#f5f5f5";
      const type = i % 2 === 0 ? "black" : "white";
      bodies.push(Physics.createBody({
        x: cx + Math.cos(angle) * ringR2,
        y: cy + Math.sin(angle) * ringR2,
        r: this.coinR, color, type, id: id++
      }));
    }

    this.coins = bodies;

    this.striker = Physics.createBody({
      x: cx, y: this.world.maxY - this.strikerR * 1.6,
      r: this.strikerR, color: "#ffc400", type: "striker", id: "striker"
    });

    this.baselineY = { 1: this.world.maxY - this.strikerR * 1.6, 2: this.world.minY + this.strikerR * 1.6 };
    this.striker.y = this.baselineY[this.currentPlayer];
  }

  get allBodies() { return [...this.coins, this.striker]; }

  resetStrikerForTurn() {
    this.striker.x = this.size / 2;
    this.striker.y = this.baselineY[this.currentPlayer];
    this.striker.vx = 0; this.striker.vy = 0;
    this.striker.active = true; this.striker.pocketed = false;
  }

  // NOTE: an earlier version of this file visually rotated the canvas 180°
  // per turn/viewer (Pass & Play hand-off, online guest mirroring). It was
  // reverted — it caused real touch-mapping confusion in practice ("now I
  // have to rotate the phone to play"). The board no longer rotates; it
  // always faces the same way for every viewer. `_myPlayerNum` is still
  // used below purely to gate WHOSE turn it is online, not for visuals.
  setMyPlayerNum(num) {
    this._myPlayerNum = num;
  }

  // ---------------- INPUT ----------------
  _bindInput() {
    this._pd = this._onPointerDown.bind(this);
    this._pm = this._onPointerMove.bind(this);
    this._pu = this._onPointerUp.bind(this);
    this.canvas.addEventListener("pointerdown", this._pd);
    window.addEventListener("pointermove", this._pm);
    window.addEventListener("pointerup", this._pu);
  }
  _unbindInput() {
    this.canvas.removeEventListener("pointerdown", this._pd);
    window.removeEventListener("pointermove", this._pm);
    window.removeEventListener("pointerup", this._pu);
  }

  _canvasPoint(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.size / rect.width;
    const scaleY = this.size / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  _onPointerDown(evt) {
    if (!this.inputEnabled || this.gameOver) return;
    if (this.mode === "computer" && this.currentPlayer === 2) return;
    if (this.mode === "online" && !this._isMyOnlineTurn()) return;

    const p = this._canvasPoint(evt);
    const distToStriker = Math.hypot(p.x - this.striker.x, p.y - this.striker.y);
    const nearBaseline = Math.abs(p.y - this.baselineY[this.currentPlayer]) < this.strikerR * 2.5;

    if (distToStriker < this.strikerR * 3) {
      this.aiming = true;
      this.aimStart = { x: this.striker.x, y: this.striker.y };
      this.aimCurrent = p;
    } else if (nearBaseline) {
      const halfWidth = (this.world.maxX - this.world.minX) / 2 - this.strikerR - 4;
      const cx = this.size / 2;
      this.striker.x = Math.max(cx - halfWidth, Math.min(cx + halfWidth, p.x));
    }
  }

  _onPointerMove(evt) {
    if (!this.aiming) return;
    this.aimCurrent = this._canvasPoint(evt);
  }

  _onPointerUp() {
    if (!this.aiming) return;
    this.aiming = false;
    const dx = this.striker.x - this.aimCurrent.x;
    const dy = this.striker.y - this.aimCurrent.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) { this.aimCurrent = null; return; }

    const maxDrag = this.size * 0.16; // shorter pull-back now reaches full power
    const power = Math.max(0.35, Math.min(dist, maxDrag) / maxDrag); // 0.35..1, floor so short flicks aren't limp
    this._fireStriker(dx / dist, dy / dist, power);
    this.aimCurrent = null;
  }

  _fireStriker(dirX, dirY, power) {
    const maxSpeed = this.size * 0.045; // was 0.028 — shots felt far too weak
    const speed = maxSpeed * power * (0.7 + this.powerMultiplier); // higher floor multiplier too
    this.striker.vx = dirX * speed;
    this.striker.vy = dirY * speed;
    this.inputEnabled = false;
    this._pendingPocketed = [];
    Settings.playShot();
    Settings.vibrate(12);
    this.onShotFired({ vx: this.striker.vx, vy: this.striker.vy, x: this.striker.x, y: this.striker.y });
  }

  // Used by AI + online-remote to fire a shot programmatically
  fireRemoteShot(vx, vy, sx, sy) {
    this.striker.x = sx; this.striker.y = sy;
    this.striker.vx = vx; this.striker.vy = vy;
    this.inputEnabled = false;
    this._pendingPocketed = [];
    Settings.playShot();
  }

  _isMyOnlineTurn() {
    return this._myPlayerNum && this._myPlayerNum === this.currentPlayer;
  }

  // ---------------- GAME LOOP ----------------
  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    const bodies = this.allBodies;
    const wasMoving = Physics.isMoving(bodies);
    if (wasMoving) {
      const pocketedIds = Physics.step(bodies, this.world);
      if (pocketedIds.length) {
        this._pendingPocketed = (this._pendingPocketed || []).concat(pocketedIds);
        Settings.playPocket();
        Settings.vibrate(pocketedIds.length > 1 ? 30 : 18);
      }

      if (!Physics.isMoving(bodies)) {
        this._resolveTurnEnd();
      }
    }
    this._draw();
  }

  _resolveTurnEnd() {
    const pocketed = this._pendingPocketed || [];
    let strikerFoul = false;

    if (this.striker.pocketed) {
      strikerFoul = true;
      this.striker.pocketed = false;
      this.striker.active = true;
    }

    let potOwn = false, potOpponent = false, potQueen = false;
    const myColor = this.currentPlayer === 1 ? "white" : "black";
    const oppColor = this.currentPlayer === 1 ? "black" : "white";

    for (const id of pocketed) {
      const coin = this.coins.find(c => c.id === id);
      if (!coin) continue;
      if (coin.type === "queen") { potQueen = true; continue; }
      if (coin.type === myColor) { potOwn = true; this.scores[this.currentPlayer]++; }
      else if (coin.type === oppColor) { potOpponent = true; this.scores[this.currentPlayer === 1 ? 2 : 1]++; }
    }

    if (potQueen) {
      this.queenPocketed = true;
      this.queenOwner = this.currentPlayer;
      this.queenNeedsCover = true;
    } else if (this.queenNeedsCover && this.queenOwner === this.currentPlayer && potOwn) {
      this.queenNeedsCover = false;
      this.scores[this.currentPlayer] += 3; // queen bonus once covered
    }

    this.onScoreChange({ ...this.scores });

    // Queen returns to center if the covering attempt failed and turn is ending
    const turnContinues = !strikerFoul && (potOwn || potQueen) ;
    if (this.queenNeedsCover && !turnContinues) {
      // failed to cover -> return queen to board center (uncounted)
      const q = this.coins.find(c => c.type === "queen");
      if (q) { q.pocketed = false; q.active = true; q.x = this.size / 2; q.y = this.size / 2; q.vx = 0; q.vy = 0; }
      this.queenNeedsCover = false;
      this.queenPocketed = false;
    }

    this._checkGameOver();
    if (this.gameOver) { this.inputEnabled = false; return; }

    const playerChanged = !turnContinues;
    if (playerChanged) {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }
    this.resetStrikerForTurn();
    this.inputEnabled = true;
    this.onTurnChange({ player: this.currentPlayer, foul: strikerFoul });

    if (this.mode === "computer" && this.currentPlayer === 2 && !this.gameOver) {
      this._aiTimeout = setTimeout(() => AIPlayer.takeTurn(this), 900);
    }
  }

  _checkGameOver() {
    const whiteLeft = this.coins.some(c => c.type === "white" && !c.pocketed);
    const blackLeft = this.coins.some(c => c.type === "black" && !c.pocketed);
    if (!whiteLeft || !blackLeft) {
      this.gameOver = true;
      const winner = this.scores[1] === this.scores[2] ? 0 : (this.scores[1] > this.scores[2] ? 1 : 2);
      this.onGameOver({ winner, scores: { ...this.scores } });
    }
  }

  // ---------------- RENDER ----------------
  _draw() {
    const ctx = this.ctx, s = this.size;
    ctx.clearRect(0, 0, s, s);

    // wood board background
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, "#e2bf8f");
    grad.addColorStop(1, "#c99a63");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // outer dark border
    ctx.strokeStyle = "#3b2412";
    ctx.lineWidth = this.margin * 0.6;
    ctx.strokeRect(this.margin * 0.5, this.margin * 0.5, s - this.margin, s - this.margin);

    // inner playing line
    ctx.strokeStyle = "#5c3b1e";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.world.minX, this.world.minY, this.world.maxX - this.world.minX, this.world.maxY - this.world.minY);

    // center circle
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, this.coinR * 3, 0, Math.PI * 2);
    ctx.strokeStyle = "#8a5a2e";
    ctx.stroke();

    // baselines
    for (const p of [1, 2]) {
      ctx.beginPath();
      ctx.moveTo(this.world.minX + 20, this.baselineY[p]);
      ctx.lineTo(this.world.maxX - 20, this.baselineY[p]);
      ctx.strokeStyle = "rgba(90,50,20,0.5)";
      ctx.stroke();
    }

    // pockets
    for (const p of this.world.pockets) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "#ffc400";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // coins
    for (const c of this.coins) {
      if (c.pocketed) continue;
      this._drawDisc(c.x, c.y, c.r, c.color, c.type === "queen");
    }

    // aim line — a full ray to the board edge, not a short stub, so it's
    // actually useful for lining up a shot at a coin further down the board
    if (this.aiming && this.aimCurrent) {
      const dx = this.striker.x - this.aimCurrent.x;
      const dy = this.striker.y - this.aimCurrent.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;

      // distance to each playing-field wall along this ray (skip near-zero/negative)
      const candidates = [];
      if (ux > 1e-6) candidates.push((this.world.maxX - this.striker.x) / ux);
      if (ux < -1e-6) candidates.push((this.world.minX - this.striker.x) / ux);
      if (uy > 1e-6) candidates.push((this.world.maxY - this.striker.y) / uy);
      if (uy < -1e-6) candidates.push((this.world.minY - this.striker.y) / uy);
      const rayLen = candidates.length ? Math.min(...candidates) : 120;

      ctx.beginPath();
      ctx.moveTo(this.striker.x, this.striker.y);
      ctx.lineTo(this.striker.x + ux * rayLen, this.striker.y + uy * rayLen);
      ctx.strokeStyle = "rgba(255,196,0,0.85)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // striker
    this._drawDisc(this.striker.x, this.striker.y, this.striker.r, "#ffc400", false, true);
  }

  _drawDisc(x, y, r, color, ring, isStriker) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = isStriker ? 2 : 1.5;
    ctx.strokeStyle = isStriker ? "#a06e00" : "rgba(0,0,0,0.4)";
    ctx.stroke();
    if (ring) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}
