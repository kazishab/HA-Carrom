# HA Carrom

Carrom game — vs Computer, Pass & Play, and Online (Create/Join Room + live chat).
Build by **HA TECH BD**. Plain HTML/CSS/JS, Firebase Realtime Database for online rooms, Google AdSense for ads.

## Folder structure

```
ha-carrom/
├── index.html
├── manifest.json            <- PWA manifest (installable app)
├── sw.js                    <- service worker (offline cache)
├── css/style.css
├── js/
│   ├── firebase-config.js   <- Firebase project config (already filled in)
│   ├── settings.js          <- sound/vibration toggles
│   ├── physics.js           <- physics engine
│   ├── board.js             <- game logic + rendering + input
│   ├── ai.js                <- computer opponent
│   ├── online.js            <- Firebase room/chat sync
│   └── main.js              <- screen navigation / app wiring
└── assets/icons/            <- logo + button icons (replace with your own as needed)
```

## 1. Before you deploy — 3 things to finish

1. **Icons/logo** — `assets/icons/*.png` are auto-generated placeholders (simple gold circles).
   Replace them with your real files, keeping the **same filenames**:
   `logo.png, favicon.png, icon-computer.png, icon-passplay.png, icon-online.png,
   icon-settings.png, icon-create.png, icon-join.png, icon-chat.png, icon-send.png`

2. **Firebase Realtime Database + Auth** — the config in `js/firebase-config.js` already points at
   your `ha-carrom` project. Two things must be turned on in the Firebase console:
   - **Build → Realtime Database → Create Database** (pick any region).
   - **Build → Authentication → Sign-in method → Anonymous → Enable.**
     The app signs every visitor in anonymously (no login screen) because the rules below
     require `auth != null` and validate chat messages against `auth.uid`.

   Rules in use (already matches the code — `senderId`/`text`/`timestamp` only in chat):
     ```json
     {
       "rules": {
         "rooms": {
           "$roomCode": {
             ".read": "auth != null",
             ".write": "auth != null",
             "status": { ".validate": "newData.isString()" },
             "createdAt": { ".validate": "newData.isNumber()" },
             "host": { ".validate": "newData.isString()" },
             "chat": {
               "$messageId": {
                 ".validate": "newData.hasChildren(['senderId','text','timestamp'])",
                 "senderId": { ".validate": "newData.isString() && newData.val() == auth.uid" },
                 "text": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 300" },
                 "timestamp": { ".validate": "newData.isNumber()" },
                 "$other": { ".validate": false }
               }
             },
             "$other": { ".validate": true }
           }
         },
         "$other": { ".read": false, ".write": false }
       }
     }
     ```
   - If your database URL differs from `https://ha-carrom-default-rtdb.firebaseio.com`,
     copy the real one shown in the console into `databaseURL` in `js/firebase-config.js`.

3. **AdSense** is currently **disabled** (commented out in `index.html`) while a
   mobile issue was being chased — see the Changelog. `data-ad-slot="0000000000"`
   (and `...01`, `...02`) are placeholders too. Once you have real ad units and
   AdSense approval: paste the real slot IDs into those three spots, then
   un-comment the AdSense `<script>` tag near the top of `index.html`.

4. **PWA / installability is paused for now.** `sw.js` was caching the app for
   offline use, but that caused a worse bug (see Changelog) — it's currently a
   "kill switch" that removes any old cached version instead of adding a new
   one. The site still works completely normally, it just won't offer
   "Add to Home Screen" or work offline until proper PWA caching is
   reintroduced later, once the app is feature-stable.

## 2. Run locally to test (optional)

Any static file server works, e.g. from the project folder:
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080` in the browser.

## 3. Push to GitHub (Chromebook Linux / Crostini)

See the commands given separately for pushing straight to
`https://github.com/kazishab/HA-Carrom`.

## 4. Free static hosting after pushing

Once it's on GitHub, turn on **GitHub Pages**:
Repo → Settings → Pages → Branch: `main` → `/ (root)` → Save.
Your live URL will be `https://kazishab.github.io/HA-Carrom/`.

## Changelog

- **Found the real cause of "fixes don't seem to work on phone": a stale
  service-worker cache trap.** The service worker added for PWA support
  cached the app's JS/CSS with a cache-first strategy under a cache name
  that never changed between deploys. Once a phone loaded it once, every
  later fix kept being silently masked — the phone kept running that first
  cached snapshot forever, no matter how many times the site was
  redeployed, which is exactly why "vs Computer doesn't work" and "no
  power" persisted after fixes that were verified working in testing.
  `sw.js` is now a self-cleaning "kill switch": it wipes every cache this
  site has, unregisters itself, and reloads any open tab — so a visitor's
  phone fixes itself automatically on next load, no manual steps needed
  (see **Troubleshooting** below for how to force it immediately if needed).
- **Splash screen now reveals as soon as the page is ready (`DOMContentLoaded`)
  instead of waiting for every image/ad/CDN script to finish (`window.load`).**
  On a slow mobile connection the old trigger could stay pending for several
  seconds (waiting on the ~300KB logo image, the AdSense script, Firebase's
  CDN files) while the splash looked frozen — likely why taps sometimes
  landed on nothing and Pass & Play only "worked after a few tries".
- **AdSense temporarily disabled** (the script tag is commented out in
  `index.html`) while chasing the mobile tap issue, to rule it out as a
  contributing factor — it wasn't approved/configured yet anyway (still
  placeholder slot IDs), so this costs nothing right now. Re-enable by
  un-commenting it once you have real ad units.
- **Striker power was too weak — fixed.** A full-power drag now reaches top
  speed with a shorter, more natural pull-back, overall speed ceiling raised
  ~60%, and short flicks have a power floor so they're not limp.
- **Aim line was too short to be useful — now a full ray.** It extends all
  the way to the board edge in the aim direction (accounting for the actual
  angle), instead of a fixed short 120px stub, so lining up a shot at a
  distant coin or pocket is actually possible.
- **Verified with a real headless test harness**, not guesswork: a
  hand-rolled DOM/canvas stub actually executes `index.html`'s exact script
  load order and simulates real pointer events (click "vs Computer", drag
  the striker, release, let physics settle, let the AI take its turn; same
  for Pass & Play including a turn hand-off) — confirming no runtime errors
  and that shots genuinely gain velocity. A separate stress test fired dozens
  of varied break shots through the real physics/board code to confirm
  pocketing is genuinely reachable, not just true for one hand-picked case.
- **(Historical) Board-flip/rotation feature — added, then reverted.** A
  version in between briefly made the board visually spin 180° per turn
  (Pass & Play) and per viewer (online guest), so whoever's holding the
  device always had their own coins at the bottom. It caused real confusion
  in practice ("now I have to rotate the phone to play"), so it was removed
  — the board always faces the same way for everyone now.
- **Fixed: coins/striker never fell into pockets.** Corner pockets sit exactly
  where the rectangular cushion (wall) collision used to trigger, so a ball's
  center could never geometrically get close enough to satisfy the old
  capture-distance check — it would just bounce off the corner forever.
  Fixed in `js/physics.js`: pockets now have a small "no cushion" zone around
  the hole (a real board has no wood there either), so a ball rolling toward
  a pocket keeps going on momentum instead of being wall-clamped back out.
  Verified with both fast and slow (rolling-to-a-stop) shots into every corner.

## Troubleshooting: phone still seems stuck on old behavior

The kill-switch above fixes itself automatically once the browser notices
`sw.js` changed and re-runs it — usually on the very next visit — but phones
can be slow to check for that update. If a phone still seems stuck after
this update is live:

1. **Fastest check**: open the site in an **Incognito/Private tab**
   (Chrome menu → *New Incognito tab*, then go to the site). Incognito never
   has any old service worker or cache, so this always shows the true latest
   version — good for confirming whether it's actually fixed.
2. **Permanent fix on that phone**: Chrome menu → tap the **site's lock/info
   icon** in the address bar (or ⋮ → *Site settings*) → **Storage & site
   data** or **Clear & reset** → confirm. This force-removes the old service
   worker and cache immediately, no waiting.

## Notes on the carrom rules (simplified)

- You always play **White**, opponent/guest plays **Black**.
- Pocket your own color → shoot again. Pocket the other color or nothing → turn passes.
- Pocket the red Queen → you must pocket one more of your own coins right after,
  or the Queen returns to the center.
- Pocketing the striker itself is a foul → turn passes immediately.
- Game ends when all 9 white + 9 black coins are pocketed.

This is intentionally a simplified rule set for a casual/mobile-friendly game —
easy to extend later (e.g. real "first pot decides color", covering across turns, etc.)
