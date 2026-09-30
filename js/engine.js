(function (root) {
  'use strict';

  const SIZE = 10;
  const FLEET = [
    { name: 'Carrier', len: 5 },
    { name: 'Battleship', len: 4 },
    { name: 'Cruiser', len: 3 },
    { name: 'Submarine', len: 3 },
    { name: 'Destroyer', len: 2 },
    { name: 'Healer', len: 2, healer: true },
  ];
  const HEALER = FLEET.findIndex((s) => s.healer);
  const HEALER_MOVES = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const HEALER_ACTIONS = [...Object.keys(HEALER_MOVES), 'rotate'];

  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  function shipCells(r, c, len, horizontal) {
    const cells = [];
    for (let i = 0; i < len; i++) cells.push(horizontal ? [r, c + i] : [r + i, c]);
    return cells;
  }

  function emptyGrid(fill) {
    return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, fill));
  }

  class Board {
    constructor() {
      this.grid = emptyGrid(() => ({ ship: -1, shot: false, hit: false, repaired: false }));
      this.ships = FLEET.map((s) => ({ name: s.name, len: s.len, healer: !!s.healer, cells: null, horizontal: true, hits: 0 }));
    }

    canPlace(idx, r, c, horizontal) {
      return shipCells(r, c, this.ships[idx].len, horizontal).every(
        ([rr, cc]) => inBounds(rr, cc) && (this.grid[rr][cc].ship === -1 || this.grid[rr][cc].ship === idx)
      );
    }

    place(idx, r, c, horizontal) {
      if (!this.canPlace(idx, r, c, horizontal)) return false;
      this.remove(idx);
      const cells = shipCells(r, c, this.ships[idx].len, horizontal);
      cells.forEach(([rr, cc]) => (this.grid[rr][cc].ship = idx));
      this.ships[idx].cells = cells;
      this.ships[idx].horizontal = horizontal;
      return true;
    }

    remove(idx) {
      const ship = this.ships[idx];
      if (!ship.cells) return;
      ship.cells.forEach(([r, c]) => (this.grid[r][c].ship = -1));
      ship.cells = null;
    }

    clear() {
      this.ships.forEach((_, i) => this.remove(i));
    }

    randomize(rng = Math.random) {
      this.clear();
      this.ships.forEach((_, i) => {
        let placed = false;
        while (!placed) {
          placed = this.place(i, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), rng() < 0.5);
        }
      });
    }

    allPlaced() {
      return this.ships.every((s) => s.cells);
    }

    isSunk(idx) {
      return this.ships[idx].hits >= this.ships[idx].len;
    }

    allSunk() {
      return this.ships.every((s) => s.hits >= s.len);
    }

    receiveShot(r, c) {
      const cell = this.grid[r][c];
      if (cell.hit) return { result: 'repeat' };
      cell.shot = true;
      cell.repaired = false;
      if (cell.ship === -1) return { result: 'miss' };
      cell.hit = true;
      const ship = this.ships[cell.ship];
      ship.hits++;
      if (ship.hits === ship.len) {
        return { result: 'sunk', ship: cell.ship, name: ship.name, healer: ship.healer, cells: ship.cells, gameOver: this.allSunk() };
      }
      return { result: 'hit', healer: ship.healer };
    }

    salvoShots() {
      const afloat = this.ships.filter((s, i) => !s.healer && s.cells && !this.isSunk(i)).length;
      return Math.max(1, afloat);
    }

    healerMobile() {
      const h = this.ships[HEALER];
      return !!h.cells && h.hits === 0;
    }

    healerCellsFor(cells, action) {
      if (action !== 'rotate') {
        const [dr, dc] = HEALER_MOVES[action];
        return cells.map(([r, c]) => [r + dr, c + dc]);
      }
      const [[r0, c0], [r1, c1]] = cells;
      const horizontal = r0 === r1;
      const pivots = [[r0, c0], [r1, c1]];
      for (const [pr, pc] of pivots) {
        const options = horizontal
          ? [[[pr, pc], [pr + 1, pc]], [[pr - 1, pc], [pr, pc]]]
          : [[[pr, pc], [pr, pc + 1]], [[pr, pc - 1], [pr, pc]]];
        for (const opt of options) if (this.canHealerOccupy(opt)) return opt;
      }
      return [[r0, c0], horizontal ? [r0 + 1, c0] : [r0, c0 + 1]];
    }

    healerCellsAfter(action) {
      return this.healerCellsFor(this.ships[HEALER].cells, action);
    }

    canHealerOccupy(cells) {
      return cells.every(([r, c]) => {
        if (!inBounds(r, c)) return false;
        const cell = this.grid[r][c];
        return !cell.hit && (cell.ship === -1 || cell.ship === HEALER);
      });
    }

    healerMoves() {
      if (!this.healerMobile()) return [];
      return HEALER_ACTIONS.filter((dir) => this.canHealerOccupy(this.healerCellsAfter(dir)));
    }

    fireNextTo(cells) {
      for (const [r, c] of cells) {
        for (const [dr, dc] of DIRS) {
          const rr = r + dr;
          const cc = c + dc;
          if (!inBounds(rr, cc)) continue;
          const cell = this.grid[rr][cc];
          if (cell.hit && cell.ship !== HEALER && !this.isSunk(cell.ship)) return [rr, cc];
        }
      }
      return null;
    }

    moveHealer(dir) {
      if (!this.healerMoves().includes(dir)) return null;
      const healer = this.ships[HEALER];
      const cells = this.healerCellsAfter(dir);
      healer.cells.forEach(([r, c]) => (this.grid[r][c].ship = -1));
      cells.forEach(([r, c]) => (this.grid[r][c].ship = HEALER));
      healer.cells = cells;
      healer.horizontal = cells[0][0] === cells[1][0];

      let repaired = null;
      const fire = this.fireNextTo(cells);
      if (fire) {
        const [r, c] = fire;
        const cell = this.grid[r][c];
        cell.shot = false;
        cell.hit = false;
        cell.repaired = true;
        this.ships[cell.ship].hits--;
        repaired = { r, c, ship: cell.ship, name: this.ships[cell.ship].name };
      }
      return { dir, cells, repaired };
    }

    planHealerMove(maxSteps) {
      if (!this.healerMobile() || maxSteps < 1) return null;
      const keyOf = (cells) => cells.map((p) => p.join(',')).join('|');
      const start = this.ships[HEALER].cells;
      const seen = new Set([keyOf(start)]);
      let frontier = [{ cells: start, first: null }];
      for (let step = 1; step <= maxSteps; step++) {
        const next = [];
        for (const node of frontier) {
          for (const dir of HEALER_ACTIONS) {
            const cells = this.healerCellsFor(node.cells, dir);
            const key = keyOf(cells);
            if (seen.has(key)) continue;
            if (!this.canHealerOccupy(cells)) continue;
            seen.add(key);
            const first = node.first || dir;
            if (this.fireNextTo(cells)) return first;
            next.push({ cells, first });
          }
        }
        frontier = next;
      }
      return null;
    }
  }

  const UNKNOWN = 0;
  const MISS = 1;
  const HIT = 2;
  const SUNK = 3;

  class AI {
    constructor(difficulty = 'hard', rng = Math.random) {
      this.difficulty = difficulty;
      this.rng = rng;
      this.knowledge = emptyGrid(() => UNKNOWN);
      this.remaining = FLEET.map((s) => s.len);
      this.enemyHealerDisabled = false;
      this.healerLead = [];
    }

    healerRange() {
      return { easy: 1, normal: 2, hard: 4 }[this.difficulty] || 0;
    }

    chooseHealerMove(ownBoard) {
      const eagerness = { easy: 0.35, normal: 0.55, hard: 0.7 }[this.difficulty] || 0;
      const dir = ownBoard.planHealerMove(this.healerRange());
      return dir && this.rng() < eagerness ? dir : null;
    }

    onRepair(r, c) {
      this.knowledge[r][c] = UNKNOWN;
      if (this.enemyHealerDisabled) return;
      const open = (rr, cc) => this.at(rr, cc) === UNKNOWN || this.at(rr, cc) === MISS;
      this.healerLead = DIRS.map(([dr, dc]) => [r + dr, c + dc]).filter(
        ([rr, cc]) => open(rr, cc) && DIRS.some(([dr, dc]) => (rr + dr !== r || cc + dc !== c) && open(rr + dr, cc + dc))
      );
    }

    at(r, c) {
      return inBounds(r, c) ? this.knowledge[r][c] : -1;
    }

    record(r, c, outcome) {
      this.healerLead = this.healerLead.filter(([rr, cc]) => rr !== r || cc !== c);
      if (outcome.healer) {
        this.enemyHealerDisabled = true;
        this.healerLead = [];
      }
      if (outcome.result === 'miss') this.knowledge[r][c] = MISS;
      else if (outcome.result === 'hit') this.knowledge[r][c] = HIT;
      else if (outcome.result === 'sunk') {
        outcome.cells.forEach(([rr, cc]) => (this.knowledge[rr][cc] = SUNK));
        const i = this.remaining.indexOf(outcome.cells.length);
        if (i !== -1) this.remaining.splice(i, 1);
      }
    }

    cellsWhere(state) {
      const out = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (this.knowledge[r][c] === state) out.push([r, c]);
      return out;
    }

    pick(list) {
      return list[Math.floor(this.rng() * list.length)];
    }

    nextShot() {
      return this.chooseShot() || this.hiddenHealerShot();
    }

    hiddenHealerShot() {
      const open = (r, c) => this.at(r, c) === UNKNOWN || this.at(r, c) === MISS;
      const misses = this.cellsWhere(MISS);
      const fits = misses.filter(([r, c]) => DIRS.some(([dr, dc]) => open(r + dr, c + dc)));
      return this.pick(fits.length ? fits : misses);
    }

    chooseShot() {
      if (this.difficulty === 'easy') return this.easyShot();
      this.healerLead = this.healerLead.filter(([r, c]) => this.at(r, c) === UNKNOWN || this.at(r, c) === MISS);
      if (this.healerLead.length) {
        if (this.difficulty === 'normal') return this.pick(this.healerLead);
        const heat = this.heatmap();
        const best = Math.max(...this.healerLead.map(([r, c]) => heat[r][c]));
        return this.pick(this.healerLead.filter(([r, c]) => heat[r][c] === best));
      }
      if (this.difficulty === 'normal') return this.normalShot();
      return this.hardShot();
    }

    neighborsOfHits() {
      const seen = new Set();
      const out = [];
      for (const [r, c] of this.cellsWhere(HIT)) {
        for (const [dr, dc] of DIRS) {
          const rr = r + dr;
          const cc = c + dc;
          const key = rr * SIZE + cc;
          if (this.at(rr, cc) === UNKNOWN && !seen.has(key)) {
            seen.add(key);
            out.push([rr, cc]);
          }
        }
      }
      return out;
    }

    easyShot() {
      if (this.rng() < 0.5) {
        const near = this.neighborsOfHits();
        if (near.length) return this.pick(near);
      }
      return this.pick(this.cellsWhere(UNKNOWN));
    }

    targetShot() {
      const hits = this.cellsWhere(HIT);
      if (!hits.length) return null;
      const lineEnds = [];
      for (const [r, c] of hits) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          if (this.at(r + dr, c + dc) !== HIT) continue;
          let rr = r;
          let cc = c;
          while (this.at(rr - dr, cc - dc) === HIT) { rr -= dr; cc -= dc; }
          if (this.at(rr - dr, cc - dc) === UNKNOWN) lineEnds.push([rr - dr, cc - dc]);
          rr = r + dr;
          cc = c + dc;
          while (this.at(rr + dr, cc + dc) === HIT) { rr += dr; cc += dc; }
          if (this.at(rr + dr, cc + dc) === UNKNOWN) lineEnds.push([rr + dr, cc + dc]);
        }
      }
      if (lineEnds.length) return this.pick(lineEnds);
      const near = this.neighborsOfHits();
      return near.length ? this.pick(near) : null;
    }

    normalShot() {
      const target = this.targetShot();
      if (target) return target;
      const unknown = this.cellsWhere(UNKNOWN);
      const minLen = Math.min(...this.remaining);
      const parity = unknown.filter(([r, c]) => (r + c) % minLen === 0);
      return this.pick(parity.length ? parity : unknown);
    }

    heatmap() {
      const heat = emptyGrid(() => 0);
      for (const len of this.remaining) {
        for (const horizontal of [true, false]) {
          for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
              const cells = shipCells(r, c, len, horizontal);
              let valid = true;
              let covered = 0;
              for (const [rr, cc] of cells) {
                const k = this.at(rr, cc);
                if (k === HIT) covered++;
                else if (k !== UNKNOWN) { valid = false; break; }
              }
              if (!valid) continue;
              const weight = Math.pow(40, covered);
              for (const [rr, cc] of cells) if (this.knowledge[rr][cc] === UNKNOWN) heat[rr][cc] += weight;
            }
          }
        }
      }
      return heat;
    }

    hardShot() {
      const heat = this.heatmap();
      let best = -1;
      let candidates = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (this.knowledge[r][c] !== UNKNOWN) continue;
          if (heat[r][c] > best) { best = heat[r][c]; candidates = [[r, c]]; }
          else if (heat[r][c] === best) candidates.push([r, c]);
        }
      }
      return this.pick(candidates);
    }
  }

  const api = { SIZE, FLEET, HEALER, HEALER_MOVES, HEALER_ACTIONS, Board, AI, shipCells, inBounds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Battleship = api;
})(typeof window !== 'undefined' ? window : globalThis);
