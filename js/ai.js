// ===================== AI OPPONENT =====================
// A lightweight heuristic AI (not a physics solver): for each of the AI's
// own coins still on the board, it lines up the striker -> coin -> pocket
// shot and scores candidates by simplicity (angle spread) + distance.
// A little random error is added so it doesn't play perfectly.

const AIPlayer = (() => {

  function pickShot(game) {
    const myColor = "black"; // AI is always player 2 = black in this build
    const myCoins = game.coins.filter(c => c.type === myColor && !c.pocketed);
    const candidates = myCoins.length ? myCoins : game.coins.filter(c => c.type === "queen" && !c.pocketed);
    const pool = candidates.length ? candidates : game.coins.filter(c => !c.pocketed);

    let best = null;
    for (const coin of pool) {
      for (const pocket of game.world.pockets) {
        const toPocketX = pocket.x - coin.x, toPocketY = pocket.y - coin.y;
        const potDist = Math.hypot(toPocketX, toPocketY);
        const nx = toPocketX / potDist, ny = toPocketY / potDist;

        // impact point: just behind the coin, opposite side from the pocket
        const impactDist = coin.r + game.striker.r + 1;
        const impactX = coin.x - nx * impactDist;
        const impactY = coin.y - ny * impactDist;

        const toImpactX = impactX - game.striker.x, toImpactY = impactY - game.striker.y;
        const strikerDist = Math.hypot(toImpactX, toImpactY);
        if (strikerDist < 1) continue;

        // Rough feasibility score: prefer shorter total distance & shots
        // that don't require an absurdly sharp angle change.
        const score = strikerDist + potDist * 0.6;

        if (!best || score < best.score) {
          best = { coin, pocket, dirX: toImpactX / strikerDist, dirY: toImpactY / strikerDist, dist: strikerDist, score };
        }
      }
    }

    if (!best) {
      // fallback: just shoot straight ahead
      return { dirX: 0, dirY: -1, power: 0.5 };
    }

    // add small aiming error for realism
    const error = (Math.random() - 0.5) * 0.06;
    const cos = Math.cos(error), sin = Math.sin(error);
    const dirX = best.dirX * cos - best.dirY * sin;
    const dirY = best.dirX * sin + best.dirY * cos;

    const power = Math.max(0.45, Math.min(1, best.dist / (game.size * 0.5)));
    return { dirX, dirY, power };
  }

  function takeTurn(game) {
    if (game.gameOver || game.currentPlayer !== 2) return;
    const shot = pickShot(game);
    const maxSpeed = game.size * 0.028;
    const speed = maxSpeed * shot.power * (0.5 + game.powerMultiplier);
    game.fireRemoteShot(shot.dirX * speed, shot.dirY * speed, game.striker.x, game.striker.y);
  }

  return { takeTurn, pickShot };
})();
