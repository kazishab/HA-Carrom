// ===================== PHYSICS ENGINE =====================
// A lightweight 2D physics engine tailored for carrom:
// circular bodies, friction, elastic collisions, cushion bounces,
// and corner pocket capture. No external library required.

const Physics = (() => {

  const FRICTION = 0.985;       // velocity multiplier per physics step (rolling friction)
  const MIN_VELOCITY = 0.04;    // below this, a body is considered stopped
  const RESTITUTION_WALL = 0.78; // energy kept on cushion bounce
  const RESTITUTION_BODY = 0.92; // energy kept on coin-coin / coin-striker collision
  const SUBSTEPS = 4;           // sub-stepping for collision accuracy at high speed

  function createBody({ x, y, r, mass = 1, type = "coin", color = "#fff", id }) {
    return { x, y, vx: 0, vy: 0, r, mass, type, color, id, active: true, pocketed: false };
  }

  function distance(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Resolve an elastic collision between two circular bodies of possibly
  // different mass. Positions are also separated to avoid overlap "stickiness".
  function resolveCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const overlap = a.r + b.r - dist;
    if (overlap <= 0) return false;

    const nx = dx / dist, ny = dy / dist;

    // Separate bodies proportional to inverse mass so heavier bodies move less
    const totalMass = a.mass + b.mass;
    const pushA = overlap * (b.mass / totalMass);
    const pushB = overlap * (a.mass / totalMass);
    a.x -= nx * pushA; a.y -= ny * pushA;
    b.x += nx * pushB; b.y += ny * pushB;

    // Relative velocity along normal
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal > 0) return true; // already separating

    const restitution = RESTITUTION_BODY;
    const impulse = (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
    const ix = impulse * nx, iy = impulse * ny;

    a.vx -= ix / a.mass; a.vy -= iy / a.mass;
    b.vx += ix / b.mass; b.vy += iy / b.mass;
    return true;
  }

  // world: { minX, minY, maxX, maxY, pockets: [{x,y,r}] }
  //
  // THE POCKET BUG (why coins/striker never fell in before this fix):
  // corner pockets sit exactly at the corner where the rectangular cushion
  // collision (below) triggers. For a ball of radius r, the closest its
  // CENTER can get to that exact corner point while still being pushed
  // back by both walls is r*sqrt(2) (tangent to both cushions at once).
  // The old capture check required the center within (p.r - r*0.35) of the
  // corner — a number smaller than r*sqrt(2) for both the coins and
  // (worse) the striker — so the cushion clamp always won the race and the
  // ball could never physically reach the capture distance. It would just
  // bounce off the corner forever.
  //
  // Fix: give each pocket a small "no cushion" zone around the hole. Once a
  // ball's center is inside that zone we skip the cushion clamp for it (a
  // real board has no wood cushion right at the hole either), so it keeps
  // rolling on momentum straight into the pocket instead of being bounced
  // back out. The zone radius is kept comfortably larger than r*sqrt(2) for
  // the biggest body (the striker) so this is geometrically always reachable.
  const POCKET_ZONE_MULT = 1.4;

  function step(bodies, world) {
    const pocketedThisStep = [];
    const dtSub = 1 / SUBSTEPS;

    for (let s = 0; s < SUBSTEPS; s++) {
      // integrate position
      for (const b of bodies) {
        if (!b.active || b.pocketed) continue;
        b.x += b.vx * dtSub;
        b.y += b.vy * dtSub;
      }

      // pocket capture + "no cushion" zone — MUST run before the wall/cushion
      // pass below, on bodies that haven't been clamped back into bounds yet.
      const skipCushion = new Set();
      for (const b of bodies) {
        if (!b.active || b.pocketed) continue;
        for (const p of world.pockets) {
          const d = distance(b, p);
          if (d < p.r) {
            b.pocketed = true;
            b.vx = 0; b.vy = 0;
            pocketedThisStep.push(b.id);
            break;
          } else if (d < p.r * POCKET_ZONE_MULT) {
            skipCushion.add(b);
            break;
          }
        }
      }

      // wall collisions (cushions) — skipped near a pocket (see above)
      for (const b of bodies) {
        if (!b.active || b.pocketed || skipCushion.has(b)) continue;
        if (b.x - b.r < world.minX) { b.x = world.minX + b.r; b.vx = -b.vx * RESTITUTION_WALL; }
        if (b.x + b.r > world.maxX) { b.x = world.maxX - b.r; b.vx = -b.vx * RESTITUTION_WALL; }
        if (b.y - b.r < world.minY) { b.y = world.minY + b.r; b.vy = -b.vy * RESTITUTION_WALL; }
        if (b.y + b.r > world.maxY) { b.y = world.maxY - b.r; b.vy = -b.vy * RESTITUTION_WALL; }
      }

      // body-body collisions
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (!a.active || a.pocketed) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          if (!b.active || b.pocketed) continue;
          resolveCollision(a, b);
        }
      }
    }

    // friction (applied once per full step, not per substep)
    for (const b of bodies) {
      if (!b.active || b.pocketed) continue;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (Math.abs(b.vx) < MIN_VELOCITY) b.vx = 0;
      if (Math.abs(b.vy) < MIN_VELOCITY) b.vy = 0;
    }

    return pocketedThisStep;
  }

  function isMoving(bodies) {
    return bodies.some(b => b.active && !b.pocketed && (Math.abs(b.vx) > 0 || Math.abs(b.vy) > 0));
  }

  return { createBody, step, isMoving, distance };
})();
