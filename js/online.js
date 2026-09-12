// ===================== ONLINE MULTIPLAYER (Firebase Realtime DB) =====================
// Strategy: instead of streaming every physics frame (expensive), only the
// SHOT itself (direction/power/start position) is sent over the network.
// Both clients run the exact same deterministic physics.js simulation
// locally starting from that shot, so the board stays in sync without
// constant traffic. Good enough for a casual 1v1 game.
//
// Auth: the database rules require `auth != null` on every room path, and
// the "chat" node validates an exact shape: {senderId, text, timestamp}
// where senderId must equal auth.uid and no other fields are allowed.
// So every call here waits for `authReady` (see firebase-config.js) first.

const OnlineManager = (() => {
  let roomCode = null;
  let roomRef = null;
  let myUid = null;
  let hostUid = null;      // used to label chat messages "Host" / "Guest"
  let myPlayerNum = null;  // 1 = host, 2 = guest
  let listeners = [];
  let gameStartFired = false; // guards against re-firing onGameStart (see watchRoom)

  function randomRoomCode() {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit numeric
  }

  async function createRoom() {
    const user = await authReady;
    myUid = user.uid;

    let code, exists = true, attempts = 0;
    do {
      code = randomRoomCode();
      const snap = await db.ref("rooms/" + code).get();
      exists = snap.exists();
      attempts++;
    } while (exists && attempts < 8);

    roomCode = code;
    roomRef = db.ref("rooms/" + roomCode);
    myPlayerNum = 1;
    hostUid = myUid;
    gameStartFired = false;

    await roomRef.set({
      host: myUid,
      guest: null,
      status: "waiting",
      createdAt: Date.now()
    });

    roomRef.child("hostLeft").onDisconnect().set(true);
    return roomCode;
  }

  async function joinRoom(code) {
    const user = await authReady;
    myUid = user.uid;

    roomCode = code;
    roomRef = db.ref("rooms/" + roomCode);
    const snap = await roomRef.get();
    if (!snap.exists()) return { ok: false, reason: "not_found" };
    const data = snap.val();
    if (data.guest) return { ok: false, reason: "full" };

    myPlayerNum = 2;
    hostUid = data.host;
    gameStartFired = false;
    await roomRef.update({ guest: myUid });
    roomRef.child("guest").onDisconnect().set(null);
    return { ok: true };
  }

  function watchRoom(callbacks) {
    if (!roomRef) return;
    // IMPORTANT: this "value" listener fires on ANY change anywhere under
    // rooms/$code — that includes every shot and every chat message pushed
    // during the match, not just top-level fields like "status". Without the
    // gameStartFired guard, onGameStart would fire again on the very first
    // shot/chat of the match and recreate the whole game (board reset,
    // duplicated shot/chat listeners). So onGameStart only fires once, on
    // the edge where status first becomes "playing".
    const cb = (snap) => {
      const data = snap.val();
      if (!data) return;
      if (data.host) hostUid = data.host;
      if (callbacks.onUpdate) callbacks.onUpdate(data);
      if (data.guest && callbacks.onGuestJoined) callbacks.onGuestJoined(data.guest);
      if (data.status === "playing" && !gameStartFired) {
        gameStartFired = true;
        if (callbacks.onGameStart) callbacks.onGameStart(data);
      }
    };
    roomRef.on("value", cb);
    listeners.push(() => roomRef.off("value", cb));
  }

  function watchShots(onShot) {
    if (!roomRef) return;
    const shotsRef = roomRef.child("shots");
    const cb = (snap) => {
      const shot = snap.val();
      if (!shot) return;
      if (shot.by === myPlayerNum) return; // ignore our own shots (already applied locally)
      onShot(shot);
    };
    shotsRef.on("child_added", cb);
    listeners.push(() => shotsRef.off("child_added", cb));
  }

  function watchChat(onMessage) {
    if (!roomRef) return;
    const chatRef = roomRef.child("chat");
    const cb = (snap) => {
      const msg = snap.val();
      if (!msg) return;
      const isMine = msg.senderId === myUid;
      const who = isMine ? "You" : (msg.senderId === hostUid ? "Host" : "Guest");
      onMessage({ ...msg, isMine, who });
    };
    chatRef.on("child_added", cb);
    listeners.push(() => chatRef.off("child_added", cb));
  }

  function startGame() {
    if (!roomRef || myPlayerNum !== 1) return;
    roomRef.update({ status: "playing", startedAt: Date.now() });
  }

  function sendShot(vx, vy, x, y) {
    if (!roomRef) return;
    roomRef.child("shots").push({ by: myPlayerNum, vx, vy, x, y, ts: Date.now() });
  }

  function sendChat(text) {
    if (!roomRef || !myUid) return;
    // Must match the DB rule's exact schema: {senderId, text, timestamp} only.
    roomRef.child("chat").push({
      senderId: myUid,
      text: text.slice(0, 300),
      timestamp: Date.now()
    });
  }

  function leaveRoom() {
    listeners.forEach(off => off());
    listeners = [];
    if (roomRef && myPlayerNum === 2) roomRef.update({ guest: null });
    roomRef = null;
    roomCode = null;
    myPlayerNum = null;
    hostUid = null;
    gameStartFired = false;
  }

  return {
    createRoom, joinRoom, watchRoom, watchShots, watchChat,
    startGame, sendShot, sendChat, leaveRoom,
    get code() { return roomCode; },
    get playerNum() { return myPlayerNum; },
  };
})();
