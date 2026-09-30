const assert = require('assert');
const { Board, AI, HEALER } = require('./js/engine.js');

function fixedBoard() {
  const b = new Board();
  b.place(0, 0, 0, true); // Carrier A1-A5
  b.place(1, 2, 0, true); // Battleship C1-C4
  b.place(2, 4, 0, true); // Cruiser E1-E3
  b.place(3, 6, 0, true); // Submarine G1-G3
  b.place(4, 8, 0, true); // Destroyer I1-I2
  b.place(HEALER, 9, 5, true); // Healer J6-J7
  return b;
}

// healer: repair, immobilize, sink
{
  const b = fixedBoard();
  assert.strictEqual(b.receiveShot(8, 1).result, 'hit'); // Destroyer I2
  assert.deepStrictEqual(b.healerMoves().sort(), ['left', 'right', 'up'].sort());
  assert.strictEqual(b.moveHealer('left').repaired, null); // J5-J6
  assert.strictEqual(b.moveHealer('left').repaired, null); // J4-J5
  const mv = b.moveHealer('left'); // J3-J4 touches I3? no: I2 is at (8,1); J3 is (9,2) -> not adjacent
  assert.strictEqual(mv.repaired, null);
  const mv2 = b.moveHealer('left'); // J2-J3, J2 touches I2
  assert.deepStrictEqual(mv2.repaired && [mv2.repaired.r, mv2.repaired.c], [8, 1]);
  assert.strictEqual(b.ships[4].hits, 0);
  assert.strictEqual(b.grid[8][1].shot, false);
  assert.strictEqual(b.grid[8][1].repaired, true);
  // re-firing at a plain miss is allowed and still a miss
  assert.strictEqual(b.receiveShot(5, 9).result, 'miss');
  assert.strictEqual(b.receiveShot(5, 9).result, 'miss');
  // healer can move onto a missed cell; re-firing there hits it and immobilizes it
  assert.strictEqual(b.receiveShot(9, 0).result, 'miss');
  assert.ok(b.healerMoves().includes('left'));
  b.moveHealer('left'); // J1-J2
  assert.strictEqual(b.grid[9][0].ship, HEALER);
  const h1 = b.receiveShot(9, 0);
  assert.strictEqual(h1.result, 'hit');
  assert.ok(h1.healer);
  assert.deepStrictEqual(b.healerMoves(), []);
  assert.strictEqual(b.moveHealer('up'), null);
  assert.strictEqual(b.receiveShot(9, 0).result, 'repeat');
  assert.strictEqual(b.receiveShot(9, 1).result, 'sunk');
}

// healer cannot move through hit cells
{
  const b = fixedBoard();
  b.place(HEALER, 7, 5, true); // H6-H7
  b.receiveShot(8, 0); // Destroyer I1 hit
  b.place(HEALER, 9, 0, true); // J1-J2 (place bypasses movement rules)
  assert.ok(!b.healerMoves().includes('up'));
}

// AI hunts old misses next to a repaired cell
{
  const ai = new AI('hard');
  ai.record(3, 5, { result: 'miss' });
  ai.record(4, 5, { result: 'hit' });
  ai.onRepair(4, 5);
  assert.ok(ai.healerLead.some(([r, c]) => r === 3 && c === 5));
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const [r, c] = ai.nextShot();
    seen.add(`${r},${c}`);
    ai.record(r, c, { result: 'miss' });
  }
  assert.ok(seen.has('3,5'), 'AI should re-fire at the old miss beside the repair');
}

// sunk ships cannot be repaired
{
  const b = fixedBoard();
  b.receiveShot(8, 0);
  b.receiveShot(8, 1);
  assert.strictEqual(b.planHealerMove(10), null);
}

// planHealerMove finds a route to a fire
{
  const b = fixedBoard();
  b.receiveShot(6, 2); // Submarine G3
  assert.ok(b.planHealerMove(10));
  let steps = 0;
  let repaired = null;
  while (!repaired && steps < 10) {
    repaired = b.moveHealer(b.planHealerMove(10)).repaired;
    steps++;
  }
  assert.ok(repaired, 'healer should reach and repair');
  assert.strictEqual(b.ships[3].hits, 0);
}

function playSolo(difficulty) {
  const board = new Board();
  board.randomize();
  const ai = new AI(difficulty);
  for (let shots = 1; shots <= 100; shots++) {
    const [r, c] = ai.nextShot();
    const out = board.receiveShot(r, c);
    assert.notStrictEqual(out.result, 'repeat', `${difficulty} AI repeated a shot`);
    ai.record(r, c, out);
    if (out.gameOver) return shots;
  }
  throw new Error(`${difficulty} AI failed to finish`);
}

// AI vs AI with healers, to make sure games terminate
function playDuel(dA, dB) {
  const boards = [new Board(), new Board()];
  boards.forEach((b) => b.randomize());
  const ais = [new AI(dA), new AI(dB)];
  for (let turn = 0; turn < 1000; turn++) {
    const me = turn % 2;
    const them = 1 - me;
    const dir = ais[me].chooseHealerMove(boards[me]);
    if (dir) {
      const mv = boards[me].moveHealer(dir);
      if (mv.repaired) ais[them].onRepair(mv.repaired.r, mv.repaired.c);
      continue;
    }
    const [r, c] = ais[me].nextShot();
    const out = boards[them].receiveShot(r, c);
    assert.notStrictEqual(out.result, 'repeat');
    ais[me].record(r, c, out);
    if (out.gameOver) return { winner: me, turns: turn + 1 };
  }
  return null;
}

const GAMES = 300;
for (const d of ['easy', 'normal', 'hard']) {
  const results = Array.from({ length: GAMES }, () => playSolo(d));
  const avg = results.reduce((a, b) => a + b, 0) / GAMES;
  console.log(`solo  ${d.padEnd(6)} avg ${avg.toFixed(1)} shots (min ${Math.min(...results)}, max ${Math.max(...results)})`);
}
for (const [a, b] of [['hard', 'hard'], ['hard', 'easy'], ['normal', 'easy']]) {
  const results = Array.from({ length: GAMES }, () => playDuel(a, b));
  const stalls = results.filter((r) => !r).length;
  const done = results.filter(Boolean);
  const winsA = done.filter((r) => r.winner === 0).length;
  const avg = done.reduce((s, r) => s + r.turns, 0) / done.length;
  console.log(`duel  ${a} vs ${b}: ${a} wins ${winsA}/${done.length}, stalls ${stalls}, avg turns ${avg.toFixed(1)}, max ${Math.max(...done.map((r) => r.turns))}`);
  assert.strictEqual(stalls, 0);
}
console.log('all tests passed');
