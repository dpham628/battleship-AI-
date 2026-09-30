(function () {
  'use strict';

  const { SIZE, FLEET, HEALER, Board, AI, shipCells } = window.Battleship;
  const LETTERS = 'ABCDEFGHIJ';
  const AI_DELAY_MS = 650;
  const RECORD_KEY = 'battleship-record';

  const $ = (sel) => document.querySelector(sel);
  const coord = (r, c) => `${LETTERS[r]}${c + 1}`;

  const els = {
    status: $('#status'),
    difficulty: $('#difficulty'),
    wins: $('#wins'),
    losses: $('#losses'),
    playerBoard: $('#player-board'),
    enemyBoard: $('#enemy-board'),
    playerPanel: $('#player-panel'),
    enemyPanel: $('#enemy-panel'),
    playerFleet: $('#player-fleet'),
    enemyFleet: $('#enemy-fleet'),
    placement: $('#placement'),
    battle: $('#battle'),
    dock: $('#dock'),
    orientation: $('#orientation'),
    start: $('#start'),
    log: $('#log'),
    showHeat: $('#show-heat'),
    healerStatus: $('#healer-status'),
    dpad: document.querySelectorAll('.dpad [data-dir]'),
    dialog: $('#gameover'),
    dialogTitle: $('#gameover-title'),
    dialogText: $('#gameover-text'),
  };

  let state;
  let playerCells;
  let enemyCells;

  function loadRecord() {
    try {
      return JSON.parse(localStorage.getItem(RECORD_KEY)) || { wins: 0, losses: 0 };
    } catch {
      return { wins: 0, losses: 0 };
    }
  }

  function saveRecord(record) {
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(record));
    } catch {
      /* storage unavailable */
    }
  }

  function buildBoard(el) {
    el.innerHTML = '';
    const cells = [];
    el.appendChild(Object.assign(document.createElement('div'), { className: 'label' }));
    for (let c = 0; c < SIZE; c++) {
      el.appendChild(Object.assign(document.createElement('div'), { className: 'label', textContent: c + 1 }));
    }
    for (let r = 0; r < SIZE; r++) {
      el.appendChild(Object.assign(document.createElement('div'), { className: 'label', textContent: LETTERS[r] }));
      cells.push([]);
      for (let c = 0; c < SIZE; c++) {
        const btn = document.createElement('button');
        btn.className = 'cell';
        btn.dataset.r = r;
        btn.dataset.c = c;
        btn.setAttribute('aria-label', coord(r, c));
        el.appendChild(btn);
        cells[r].push(btn);
      }
    }
    return cells;
  }

  function cellFromEvent(e) {
    const t = e.target.closest('.cell');
    return t ? [Number(t.dataset.r), Number(t.dataset.c)] : null;
  }

  function newGame() {
    els.dialog.open && els.dialog.close();
    state = {
      phase: 'placement',
      player: new Board(),
      enemy: new Board(),
      ai: new AI(els.difficulty.value),
      selected: 0,
      horizontal: true,
      hover: null,
      busy: false,
      lastAiShot: null,
      lastPlayerShot: null,
      healerFlash: null,
      pendingRefire: null,
      stats: { pShots: 0, pHits: 0, aShots: 0, aHits: 0 },
    };
    state.enemy.randomize();
    els.log.innerHTML = '';
    els.placement.classList.remove('hidden');
    els.battle.classList.add('hidden');
    els.difficulty.disabled = false;
    setStatus('Deploy your fleet to begin.');
    render();
  }

  function setStatus(text, cls = '') {
    els.status.textContent = text;
    els.status.className = `status ${cls}`;
  }

  function nextUnplaced(from) {
    for (let i = 1; i <= FLEET.length; i++) {
      const idx = (from + i) % FLEET.length;
      if (!state.player.ships[idx].cells) return idx;
    }
    return null;
  }

  function rotate() {
    if (state.phase !== 'placement') return;
    state.horizontal = !state.horizontal;
    render();
  }

  function onPlayerBoardClick(e) {
    if (state.phase !== 'placement') return;
    const pos = cellFromEvent(e);
    if (!pos) return;
    const [r, c] = pos;
    const occupant = state.player.grid[r][c].ship;
    if (state.selected !== null && state.player.place(state.selected, r, c, state.horizontal)) {
      state.selected = nextUnplaced(state.selected);
    } else if (occupant !== -1) {
      state.selected = occupant;
      state.horizontal = state.player.ships[occupant].horizontal;
    }
    render();
  }

  function onEnemyBoardClick(e) {
    if (state.phase !== 'battle' || state.busy) return;
    const pos = cellFromEvent(e);
    if (!pos) return;
    const [r, c] = pos;
    const target = state.enemy.grid[r][c];
    if (target.hit) return;
    const armed = state.pendingRefire && state.pendingRefire[0] === r && state.pendingRefire[1] === c;
    if (target.shot && !armed) {
      state.pendingRefire = [r, c];
      setStatus(`${coord(r, c)} was a miss. Click it again to fire there anyway — the enemy Healer may have moved in.`, 'turn-player');
      renderEnemyBoard();
      return;
    }
    state.pendingRefire = null;

    const out = state.enemy.receiveShot(r, c);
    state.stats.pShots++;
    if (out.result !== 'miss') state.stats.pHits++;
    state.lastPlayerShot = [r, c];
    logShot('player', r, c, out);

    if (out.gameOver) return endGame(true);

    endPlayerTurn();
  }

  function endPlayerTurn() {
    state.busy = true;
    setStatus('Enemy is taking aim…');
    render();
    setTimeout(aiTurn, AI_DELAY_MS);
  }

  function moveHealer(dir) {
    if (state.phase !== 'battle' || state.busy) return;
    const mv = state.player.moveHealer(dir);
    if (!mv) return;
    state.pendingRefire = null;
    if (mv.repaired) state.ai.onRepair(mv.repaired.r, mv.repaired.c);
    state.healerFlash = 'player';
    logMove('player', mv);
    endPlayerTurn();
  }

  function playerTurnStatus() {
    return state.player.healerMobile()
      ? 'Your turn — fire on Enemy Waters or move your Healer.'
      : 'Your turn — fire on Enemy Waters.';
  }

  function aiTurn() {
    if (state.phase !== 'battle') return;
    state.healerFlash = null;
    const dir = state.ai.chooseHealerMove(state.enemy);
    if (dir) {
      const mv = state.enemy.moveHealer(dir);
      logMove('ai', mv);
      if (mv.repaired) state.lastPlayerShot = null;
      state.busy = false;
      setStatus(playerTurnStatus(), 'turn-player');
      render();
      return;
    }
    const [r, c] = state.ai.nextShot();
    const out = state.player.receiveShot(r, c);
    state.ai.record(r, c, out);
    state.stats.aShots++;
    if (out.result !== 'miss') state.stats.aHits++;
    state.lastAiShot = [r, c];
    logShot('ai', r, c, out);

    if (out.gameOver) return endGame(false);

    state.busy = false;
    setStatus(playerTurnStatus(), 'turn-player');
    render();
  }

  function addLog(cls, text) {
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = text;
    els.log.prepend(li);
    while (els.log.children.length > 100) els.log.lastChild.remove();
  }

  function logMove(who, mv) {
    const own = who === 'player' ? 'your' : 'its';
    let text = who === 'player' ? `You moved your Healer ${mv.dir}` : 'AI moved its Healer';
    text += mv.repaired ? ` and put out the fire on ${own} ${mv.repaired.name} at ${coord(mv.repaired.r, mv.repaired.c)}!` : '.';
    addLog(`${who} move${mv.repaired ? ' repair' : ''}`, text);
  }

  function logShot(who, r, c, out) {
    const actor = who === 'player' ? 'You' : 'AI';
    let text = `${actor} fired at ${coord(r, c)} — `;
    if (out.result === 'miss') text += 'miss.';
    else if (out.result === 'hit' && out.healer) text += `hit ${who === 'player' ? 'their' : 'your'} Healer — it's immobilized!`;
    else if (out.result === 'hit') text += 'hit!';
    else text += who === 'player' ? `sunk their ${out.name}!` : `sunk your ${out.name}!`;
    addLog(`${who} ${out.result}`, text);
  }

  function startBattle() {
    if (!state.player.allPlaced()) return;
    state.phase = 'battle';
    state.selected = null;
    state.hover = null;
    state.ai.difficulty = els.difficulty.value;
    els.difficulty.disabled = true;
    els.placement.classList.add('hidden');
    els.battle.classList.remove('hidden');
    setStatus(playerTurnStatus(), 'turn-player');
    render();
  }

  function endGame(playerWon) {
    state.phase = 'over';
    state.busy = false;
    const record = loadRecord();
    playerWon ? record.wins++ : record.losses++;
    saveRecord(record);

    const { pShots, pHits } = state.stats;
    const acc = pShots ? Math.round((pHits / pShots) * 100) : 0;
    els.dialogTitle.textContent = playerWon ? 'Victory!' : 'Defeat';
    els.dialogText.textContent = playerWon
      ? `You sank the enemy fleet in ${pShots} shots (${acc}% accuracy).`
      : `The AI (${els.difficulty.value}) sank your fleet in ${state.stats.aShots} shots.`;
    setStatus(playerWon ? 'You win! The enemy fleet is destroyed.' : 'You lose. Your fleet has been sunk.', playerWon ? 'win' : 'lose');
    els.difficulty.disabled = false;
    render();
    setTimeout(() => els.dialog.showModal(), 500);
  }

  function shipShapeClasses(board, idx, r, c) {
    const ship = board.ships[idx];
    const cls = ['ship', ship.horizontal ? 'h' : 'v'];
    if (ship.healer) cls.push('healer');
    const [sr, sc] = ship.cells[0];
    const [er, ec] = ship.cells[ship.cells.length - 1];
    if (r === sr && c === sc) cls.push('start');
    if (r === er && c === ec) cls.push('end');
    return cls;
  }

  function renderPlayerBoard() {
    const board = state.player;
    const placing = state.phase === 'placement';
    els.playerBoard.classList.toggle('placing', placing);

    let preview = null;
    if (placing && state.selected !== null && state.hover) {
      const [hr, hc] = state.hover;
      const cells = shipCells(hr, hc, board.ships[state.selected].len, state.horizontal);
      preview = { ok: board.canPlace(state.selected, hr, hc, state.horizontal), keys: new Set(cells.map(([r, c]) => r * SIZE + c)) };
    }

    let heat = null;
    let maxHeat = 0;
    if (els.showHeat.checked && state.phase === 'battle') {
      heat = state.ai.heatmap();
      heat.forEach((row) => row.forEach((v) => (maxHeat = Math.max(maxHeat, v))));
    }

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = board.grid[r][c];
        const el = playerCells[r][c];
        const cls = ['cell'];
        if (cell.ship !== -1) {
          cls.push(...shipShapeClasses(board, cell.ship, r, c));
          if (placing && cell.ship === state.selected) cls.push('selected');
          if (board.isSunk(cell.ship)) cls.push('sunk');
        }
        if (cell.hit) cls.push('shot', 'hit');
        else if (cell.shot) cls.push('shot', 'miss');
        else if (cell.repaired) cls.push('repaired');
        if (state.healerFlash === 'player' && cell.ship === HEALER) cls.push('healer-flash');
        if (state.lastAiShot && state.lastAiShot[0] === r && state.lastAiShot[1] === c) cls.push('last');
        if (preview && preview.keys.has(r * SIZE + c)) cls.push(preview.ok ? 'preview-ok' : 'preview-bad');
        el.style.removeProperty('--heat');
        if (heat && !cell.hit && maxHeat > 0 && heat[r][c] > 0) {
          cls.push('heat');
          el.style.setProperty('--heat', (heat[r][c] / maxHeat).toFixed(3));
        }
        el.className = cls.join(' ');
      }
    }
  }

  function renderEnemyBoard() {
    const board = state.enemy;
    const over = state.phase === 'over';
    els.enemyBoard.classList.toggle('targetable', state.phase === 'battle' && !state.busy);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = board.grid[r][c];
        const el = enemyCells[r][c];
        const cls = ['cell'];
        const sunk = cell.ship !== -1 && board.isSunk(cell.ship);
        if (sunk) cls.push(...shipShapeClasses(board, cell.ship, r, c), 'sunk');
        else if (over && cell.ship !== -1 && !cell.hit) cls.push('reveal');
        if (cell.hit) cls.push('shot', 'hit');
        else if (cell.shot) cls.push('shot', 'miss');
        else if (cell.repaired) cls.push('repaired');
        if (state.pendingRefire && state.pendingRefire[0] === r && state.pendingRefire[1] === c) cls.push('armed');
        if (state.lastPlayerShot && state.lastPlayerShot[0] === r && state.lastPlayerShot[1] === c) cls.push('last');
        el.className = cls.join(' ');
      }
    }
  }

  function pips(ship, showHits) {
    let html = '<span class="pips">';
    for (let i = 0; i < ship.len; i++) {
      const cls = showHits && i < ship.hits ? ' hit' : ship.healer ? ' healer' : '';
      html += `<span class="pip${cls}"></span>`;
    }
    return html + '</span>';
  }

  function renderFleet(el, board, showHits) {
    el.innerHTML = board.ships
      .map((s, i) => {
        const label = s.healer && s.hits > 0 && !board.isSunk(i) ? `${s.name} (stuck)` : s.name;
        return `<li class="${board.isSunk(i) ? 'sunk' : ''}"><span>${label}</span>${pips(s, showHits || (s.healer && s.hits > 0))}</li>`;
      })
      .join('');
  }

  function renderDock() {
    els.dock.innerHTML = '';
    state.player.ships.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = [s.cells ? 'placed' : '', state.selected === i ? 'selected' : ''].join(' ');
      btn.innerHTML = `<span>${s.name} (${s.len})</span>${pips(s, false)}`;
      btn.addEventListener('click', () => {
        state.selected = i;
        if (s.cells) state.horizontal = s.horizontal;
        render();
      });
      els.dock.appendChild(btn);
    });
    els.orientation.textContent = state.horizontal ? 'horizontal' : 'vertical';
    els.start.disabled = !state.player.allPlaced();
  }

  function renderHealerControls() {
    const healer = state.player.ships[HEALER];
    const moves = state.phase === 'battle' && !state.busy ? state.player.healerMoves() : [];
    els.dpad.forEach((btn) => (btn.disabled = !moves.includes(btn.dataset.dir)));
    let status;
    if (state.player.isSunk(HEALER)) status = 'Sunk.';
    else if (healer.hits > 0) status = 'Hit and immobilized for the rest of the game.';
    else {
      const fire = state.player.fireNextTo(healer.cells);
      status = fire ? `Mobile. Next to a fire at ${coord(fire[0], fire[1])} — move along it to repair.` : 'Mobile. Move next to a burning ship to repair it.';
    }
    els.healerStatus.textContent = status;
  }

  function renderStats() {
    const { pShots, pHits, aShots, aHits } = state.stats;
    const pct = (h, s) => (s ? `${Math.round((h / s) * 100)}%` : '–');
    $('#p-shots').textContent = pShots;
    $('#p-hits').textContent = pHits;
    $('#p-acc').textContent = pct(pHits, pShots);
    $('#a-shots').textContent = aShots;
    $('#a-hits').textContent = aHits;
    $('#a-acc').textContent = pct(aHits, aShots);
  }

  function render() {
    renderPlayerBoard();
    renderEnemyBoard();
    renderFleet(els.playerFleet, state.player, true);
    renderFleet(els.enemyFleet, state.enemy, false);
    if (state.phase === 'placement') renderDock();
    renderStats();
    if (state.phase !== 'placement') renderHealerControls();
    const battle = state.phase === 'battle';
    els.enemyPanel.classList.toggle('active', battle && !state.busy);
    els.playerPanel.classList.toggle('active', battle && state.busy);
    const record = loadRecord();
    els.wins.textContent = record.wins;
    els.losses.textContent = record.losses;
  }

  playerCells = buildBoard(els.playerBoard);
  enemyCells = buildBoard(els.enemyBoard);

  els.playerBoard.addEventListener('click', onPlayerBoardClick);
  els.playerBoard.addEventListener('mouseover', (e) => {
    const pos = cellFromEvent(e);
    if (state.phase !== 'placement' || !pos) return;
    state.hover = pos;
    renderPlayerBoard();
  });
  els.playerBoard.addEventListener('mouseleave', () => {
    state.hover = null;
    renderPlayerBoard();
  });
  els.playerBoard.addEventListener('contextmenu', (e) => {
    if (state.phase !== 'placement') return;
    e.preventDefault();
    rotate();
  });
  els.enemyBoard.addEventListener('click', onEnemyBoardClick);

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) rotate();
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (dir && state.phase === 'battle') {
      e.preventDefault();
      moveHealer(dir);
    }
  });

  els.dpad.forEach((btn) => btn.addEventListener('click', () => moveHealer(btn.dataset.dir)));
  $('#rotate').addEventListener('click', rotate);
  $('#randomize').addEventListener('click', () => {
    state.player.randomize();
    state.selected = null;
    render();
  });
  $('#clear').addEventListener('click', () => {
    state.player.clear();
    state.selected = 0;
    render();
  });
  els.start.addEventListener('click', startBattle);
  els.showHeat.addEventListener('change', renderPlayerBoard);
  $('#new-game').addEventListener('click', () => {
    if (state.phase === 'battle' && !confirm('Abandon the current game?')) return;
    newGame();
  });
  $('#play-again').addEventListener('click', newGame);
  $('#review').addEventListener('click', () => els.dialog.close());
  els.difficulty.addEventListener('change', () => {
    if (state.phase === 'placement') state.ai.difficulty = els.difficulty.value;
  });

  newGame();
})();
