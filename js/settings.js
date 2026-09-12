// ===================== SETTINGS (sound + vibration) =====================
// Sound effects are synthesised with the Web Audio API — no audio files to
// ship or load. Vibration uses the standard Vibration API (mostly Android;
// iOS Safari has no support, so it's a silent no-op there). Both prefs are
// remembered in localStorage across visits.

const Settings = (() => {
  const SOUND_KEY = "ha_carrom_sound";
  const VIBRATION_KEY = "ha_carrom_vibration";

  let soundOn = localStorage.getItem(SOUND_KEY) !== "off";         // default ON
  let vibrationOn = localStorage.getItem(VIBRATION_KEY) !== "off"; // default ON

  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { audioCtx = new AC(); } catch (e) { audioCtx = null; } }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  // Short percussive "knock" — the striker being struck.
  function playShot() {
    if (!soundOn) return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Cartoon-ish downward "plop" — a coin dropping into a pocket.
  function playPocket() {
    if (!soundOn) return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.15);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  function vibrate(ms) {
    if (!vibrationOn) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* unsupported */ } }
  }

  function setSound(on) {
    soundOn = on;
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    if (on) ctx(); // prime/unlock the audio context from this user gesture
  }
  function setVibration(on) {
    vibrationOn = on;
    localStorage.setItem(VIBRATION_KEY, on ? "on" : "off");
    if (on) vibrate(15);
  }

  return {
    get soundOn() { return soundOn; },
    get vibrationOn() { return vibrationOn; },
    setSound, setVibration,
    playShot, playPocket, vibrate,
  };
})();
