(function () {
  'use strict';

  const { SIZE, HEALER, Board, AI } = window.Battleship;
  const { shipSvg } = window.ShipArt;
  const LETTERS = 'ABCDEFGHIJ';
  const AI_DELAY_MS = 700;
  const SHELL_MS = 380;
  const RECORD_KEY = 'battleship-record';
  const SOUND_KEY = 'battleship-sound';
  const MODE_KEY = 'battleship-mode';
  const HEALER_KEY = 'battleship-healer';
  const SALVO_GAP_MS = 260;
  const DOUSE_DELAY_MS = 380;
  const DOUSE_MS = 1700;

  const $ = (sel) => document.querySelector(sel);
  const coord = (r, c) => `${LETTERS[r]}${c + 1}`;

  const els = {
    status: $('#status'),
    difficulty: $('#difficulty'),
    wins: $('#wins'),
    losses: $('#losses'),
    soundToggle: $('#sound-toggle'),
    modeButtons: document.querySelectorAll('.mode-btn'),
    modeBadge: $('#mode-badge'),
    modeHint: $('#mode-hint'),
    healerToggle: $('#healer-toggle'),
    healerRules: $('#healer-rules'),
    healerControls: $('#healer-controls'),
    salvoMeter: $('#salvo-meter'),
    salvoShells: $('#salvo-shells'),
    salvoText: $('#salvo-text'),
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

  const Sound = (() => {
    let ctx = null;
    let enabled = localStorage.getItem(SOUND_KEY) !== 'off';

    function audio() {
      if (!enabled) return null;
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function noise(dur, type, freq, gain, q = 1) {
      const a = audio();
      if (!a) return;
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = a.createGain();
      g.gain.value = gain;
      src.connect(filter).connect(g).connect(a.destination);
      src.start();
    }

    function tone(type, from, to, dur, gain, delay = 0) {
      const a = audio();
      if (!a) return;
      const t = a.currentTime + delay;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(a.destination);
      osc.start(t);
      osc.stop(t + dur);
    }

    return {
      get enabled() {
        return enabled;
      },
      toggle() {
        enabled = !enabled;
        localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
        return enabled;
      },
      whistle: () => tone('triangle', 1500, 500, SHELL_MS / 1000, 0.04),
      boom: () => { noise(0.9, 'lowpass', 900, 0.9); tone('sine', 110, 35, 0.5, 0.7); },
      splash: () => noise(0.5, 'bandpass', 1500, 0.6, 0.7),
      sink: () => { noise(1.8, 'lowpass', 350, 0.9); tone('sine', 70, 25, 1.4, 0.6); },
      hiss: () => noise(1.3, 'highpass', 2200, 0.35, 0.5),
      repair: () => { tone('sine', 660, 880, 0.12, 0.12); tone('sine', 880, 1320, 0.16, 0.12, 0.12); },
    };
  })();

  let state;
  let gameId = 0;
  let mode = localStorage.getItem(MODE_KEY) === 'salvo' ? 'salvo' : 'classic';
  const isSalvo = () => mode === 'salvo';
  let healerOn = localStorage.getItem(HEALER_KEY) !== 'off';
  const useHealer = () => !isSalvo() && healerOn;
  const fleetOpts = () => ({ healer: useHealer() });
  let player;
  let enemy;

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

  function div(className) {
    const el = document.createElement('div');
    el.className = className;
    return el;
  }

  function buildBoard(el) {
    el.innerHTML = '';
    const view = { el, cells: [], sprites: {}, fires: {} };
    el.appendChild(div('label'));
    for (let c = 0; c < SIZE; c++) el.appendChild(Object.assign(div('label'), { textContent: c + 1 }));
    for (let r = 0; r < SIZE; r++) {
      el.appendChild(Object.assign(div('label'), { textContent: LETTERS[r] }));
      view.cells.push([]);
      for (let c = 0; c < SIZE; c++) {
        const btn = document.createElement('button');
        btn.className = 'cell';
        btn.dataset.r = r;
        btn.dataset.c = c;
        btn.style.setProperty('--d', Math.random().toFixed(2));
        btn.setAttribute('aria-label', coord(r, c));
        el.appendChild(btn);
        view.cells[r].push(btn);
      }
    }
    view.shipLayer = div('ship-layer');
    view.fxLayer = div('fx-layer');
    view.reticle = div('reticle');
    view.reticle.hidden = true;
    view.fxLayer.appendChild(view.reticle);
    view.fireLayer = div('fire-layer');
    el.append(div('water'), view.shipLayer, view.fireLayer, view.fxLayer);
    return view;
  }

  const FIRE_HTML =
    '<i class="glow"></i><i class="smoke"></i><i class="smoke"></i><i class="smoke"></i>' +
    '<i class="flame f2"></i><i class="flame f3"></i><i class="flame f1"></i><i class="flame f4"></i>' +
    '<i class="ember"></i><i class="ember"></i><i class="ember"></i>';

  function syncFires(view, board) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const key = `${r},${c}`;
        const cell = board.grid[r][c];
        let el = view.fires[key];
        if (!cell.hit) {
          if (el) {
            el.remove();
            delete view.fires[key];
          }
          continue;
        }
        if (!el) {
          el = div('fire');
          el.innerHTML = FIRE_HTML;
          el.style.setProperty('--fd', (Math.random() * -2).toFixed(2) + 's');
          position(el, r, c);
          view.fireLayer.appendChild(el);
          view.fires[key] = el;
        }
        el.classList.toggle('smolder', cell.ship !== -1 && board.isSunk(cell.ship));
      }
    }
  }

  function douse(view, fromCells, r, c) {
    const key = `${r},${c}`;
    const fire = view.fires[key];
    delete view.fires[key];
    const src = fromCells && fromCells.find(([sr, sc]) => Math.abs(sr - r) + Math.abs(sc - c) === 1);
    const delay = src ? DOUSE_DELAY_MS : 0;
    if (src) {
      const hose = div('fx-item hose');
      position(hose, src[0], src[1]);
      hose.style.setProperty('--ang', `${(Math.atan2(r - src[0], c - src[1]) * 180) / Math.PI}deg`);
      hose.style.setProperty('--delay', `${delay}ms`);
      hose.innerHTML = `<div class="hose-rot">${'<i class="drop"></i>'.repeat(12)}</div>`;
      view.fxLayer.appendChild(hose);
      setTimeout(() => hose.remove(), DOUSE_MS);
    }
    if (fire) {
      fire.style.setProperty('--douse-delay', `${delay + 250}ms`);
      fire.classList.add('dousing');
      setTimeout(() => fire.remove(), DOUSE_MS);
    }
    const id = gameId;
    setTimeout(() => {
      if (id !== gameId) return;
      const spray = div('fx-item spray');
      position(spray, r, c);
      spray.innerHTML =
        Array.from({ length: 10 }, (_, i) => `<i class="sd" style="--a:${i * 36 + Math.random() * 20}deg"></i>`).join('') +
        '<i class="steam"></i><i class="steam"></i><i class="steam"></i>';
      view.fxLayer.appendChild(spray);
      setTimeout(() => spray.remove(), 1600);
      Sound.hiss();
      setTimeout(Sound.repair, 700);
    }, delay + 200);
  }

  function position(el, r, c) {
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
  }

  function drawSprite(view, key, ship, r, c, horizontal, extra) {
    let el = view.sprites[key];
    if (!el || el.dataset.name !== ship.name) {
      if (el) el.remove();
      el = div('ship-sprite');
      el.dataset.name = ship.name;
      el.innerHTML = `<div class="ship-inner">${shipSvg(ship.name, ship.len)}</div>`;
      el.style.setProperty('--len', ship.len);
      el.style.setProperty('--bob', `${(Math.random() * -4).toFixed(2)}s`);
      view.shipLayer.appendChild(el);
      view.sprites[key] = el;
    }
    el.hidden = false;
    position(el, r, c);
    el.className = ['ship-sprite', `ship-${ship.name.toLowerCase()}`, horizontal ? 'h' : 'v', ...extra].join(' ');
  }

  function hideSprite(view, key) {
    if (view.sprites[key]) view.sprites[key].hidden = true;
  }

  function setReticle(view, pos) {
    view.reticle.hidden = !pos;
    if (pos) position(view.reticle, pos[0], pos[1]);
  }

  function spawnFx(view, r, c, type, ms) {
    const el = div(`fx-item ${type}`);
    position(el, r, c);
    view.fxLayer.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function cellFromEvent(e) {
    const t = e.target.closest('.cell');
    return t ? [Number(t.dataset.r), Number(t.dataset.c)] : null;
  }

  function newGame() {
    if (els.dialog.open) els.dialog.close();
    gameId++;
    state = {
      phase: 'placement',
      player: new Board(fleetOpts()),
      enemy: new Board(fleetOpts()),
      ai: new AI(els.difficulty.value, Math.random, fleetOpts()),
      selected: 0,
      horizontal: true,
      hover: null,
      busy: false,
      lastAiShot: null,
      lastPlayerShot: null,
      healerFlash: null,
      pendingRefire: null,
      shotsTotal: 1,
      shotsLeft: 1,
      stats: { pShots: 0, pHits: 0, aShots: 0, aHits: 0 },
      turns: { player: 0, ai: 0 },
    };
    state.enemy.randomize();
    for (const view of [player, enemy]) {
      Object.values(view.sprites).forEach((el) => el.remove());
      view.sprites = {};
      view.fireLayer.innerHTML = '';
      view.fires = {};
    }
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
    const n = state.player.ships.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!state.player.ships[idx].cells) return idx;
    }
    return null;
  }

  function rotate() {
    if (state.phase === 'battle') return moveHealer('rotate');
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

  function launch(view, r, c, done) {
    const id = gameId;
    Sound.whistle();
    spawnFx(view, r, c, 'incoming', SHELL_MS + 60);
    setTimeout(() => {
      if (id === gameId) done();
    }, SHELL_MS);
  }

  function impact(view, r, c, out) {
    if (out.result === 'miss') {
      spawnFx(view, r, c, 'splash', 1000);
      Sound.splash();
      return;
    }
    spawnFx(view, r, c, 'boom', 900);
    Sound.boom();
    if (out.result === 'sunk') {
      Sound.sink();
      shake(view.el);
      out.cells.forEach(([rr, cc], i) => setTimeout(() => spawnFx(view, rr, cc, 'boom', 900), 110 * (i + 1)));
    }
  }

  function onEnemyBoardClick(e) {
    if (state.phase !== 'battle' || state.busy) return;
    const pos = cellFromEvent(e);
    if (!pos) return;
    const [r, c] = pos;
    const target = state.enemy.grid[r][c];
    if (target.hit || (target.shot && !useHealer())) return;
    const armed = state.pendingRefire && state.pendingRefire[0] === r && state.pendingRefire[1] === c;
    if (target.shot && !armed) {
      state.pendingRefire = [r, c];
      setStatus(`${coord(r, c)} was a miss. Click it again to fire there anyway — the enemy Healer may have moved in.`, 'turn-player');
      renderEnemyBoard();
      return;
    }
    state.pendingRefire = null;
    state.busy = true;
    setStatus(isSalvo() ? `Firing shot ${state.shotsTotal - state.shotsLeft + 1} of ${state.shotsTotal} at ${coord(r, c)}…` : `Firing at ${coord(r, c)}…`);
    render();

    launch(enemy, r, c, () => {
      const out = state.enemy.receiveShot(r, c);
      state.stats.pShots++;
      if (out.result !== 'miss') state.stats.pHits++;
      state.lastPlayerShot = [r, c];
      impact(enemy, r, c, out);
      logShot('player', r, c, out);
      if (out.gameOver) return endGame(true);
      state.shotsLeft--;
      if (state.shotsLeft > 0) {
        state.busy = false;
        setStatus(playerTurnStatus(), 'turn-player');
        return render();
      }
      endPlayerTurn();
    });
  }

  function endPlayerTurn(delay = AI_DELAY_MS) {
    const id = gameId;
    state.turns.player++;
    state.busy = true;
    setStatus('Enemy is taking aim…');
    render();
    setTimeout(() => {
      if (id === gameId) aiTurn();
    }, delay);
  }

  function midSalvo() {
    return state.shotsLeft < state.shotsTotal;
  }

  function moveHealer(dir) {
    if (state.phase !== 'battle' || state.busy || midSalvo()) return;
    const mv = state.player.moveHealer(dir);
    if (!mv) return;
    state.pendingRefire = null;
    if (mv.repaired) {
      state.ai.onRepair(mv.repaired.r, mv.repaired.c);
      douse(player, mv.cells, mv.repaired.r, mv.repaired.c);
    }
    state.healerFlash = 'player';
    logMove('player', mv);
    endPlayerTurn(mv.repaired ? DOUSE_MS : AI_DELAY_MS);
  }

  function playerTurnStatus() {
    if (isSalvo()) {
      const left = `${state.shotsLeft} of ${state.shotsTotal} shot${state.shotsTotal === 1 ? '' : 's'} left`;
      if (midSalvo()) return `Salvo — ${left}. Keep firing!`;
      return state.player.healerMobile()
        ? `Your salvo — ${left}. Fire on Enemy Waters, or move your Healer instead.`
        : `Your salvo — ${left}. Fire on Enemy Waters.`;
    }
    return state.player.healerMobile()
      ? 'Your turn — fire on Enemy Waters or move your Healer.'
      : 'Your turn — fire on Enemy Waters.';
  }

  function startPlayerTurn() {
    state.busy = false;
    state.shotsTotal = isSalvo() ? state.player.salvoShots(state.turns.player === 0) : 1;
    state.shotsLeft = state.shotsTotal;
    setStatus(playerTurnStatus(), 'turn-player');
    render();
  }

  function aiTurn() {
    if (state.phase !== 'battle') return;
    state.healerFlash = null;
    const dir = state.ai.chooseHealerMove(state.enemy);
    if (dir) {
      const mv = state.enemy.moveHealer(dir);
      logMove('ai', mv);
      if (mv.repaired) {
        douse(enemy, null, mv.repaired.r, mv.repaired.c);
        state.lastPlayerShot = null;
      }
      return startPlayerTurn();
    }
    const total = isSalvo() ? state.enemy.salvoShots(state.turns.ai === 0) : 1;
    state.turns.ai++;
    const id = gameId;
    const fireOne = (k) => {
      if (id !== gameId) return;
      if (total > 1) setStatus(`Enemy salvo — shot ${k + 1} of ${total}…`);
      const [r, c] = state.ai.nextShot();
      launch(player, r, c, () => {
        const out = state.player.receiveShot(r, c);
        state.ai.record(r, c, out);
        state.stats.aShots++;
        if (out.result !== 'miss') state.stats.aHits++;
        state.lastAiShot = [r, c];
        impact(player, r, c, out);
        logShot('ai', r, c, out);
        if (out.gameOver) return endGame(false);
        if (k + 1 < total) {
          renderPlayerBoard();
          return setTimeout(() => fireOne(k + 1), SALVO_GAP_MS);
        }
        startPlayerTurn();
      });
    };
    fireOne(0);
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
    const verb = mv.dir === 'rotate' ? 'rotated' : 'moved';
    let text = who === 'player' ? `You ${verb} your Healer${mv.dir === 'rotate' ? '' : ` ${mv.dir}`}` : `AI ${verb} its Healer`;
    const where = coord(mv.repaired?.r, mv.repaired?.c);
    const fire = who === 'player' ? `the fire on ${own} ${mv.repaired?.name} at ${where}` : `a fire at ${where}`;
    text += mv.repaired ? ` and put out ${fire}!` : '.';
    addLog(`${who} move${mv.repaired ? ' repair' : ''}`, text);
  }

  function logShot(who, r, c, out) {
    const actor = who === 'player' ? 'You' : 'AI';
    let text = `${actor} fired at ${coord(r, c)} — `;
    if (out.result === 'miss') text += 'miss.';
    else if (out.result === 'hit' && out.healer && who === 'ai') text += 'hit your Healer — it can no longer move or repair!';
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
    renderMode();
    els.placement.classList.add('hidden');
    els.battle.classList.remove('hidden');
    startPlayerTurn();
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
    if (isSalvo()) els.dialogText.textContent += ' (Salvo mode)';
    setStatus(playerWon ? 'You win! The enemy fleet is destroyed.' : 'You lose. Your fleet has been sunk.', playerWon ? 'win' : 'lose');
    els.difficulty.disabled = false;
    render();
    const id = gameId;
    setTimeout(() => {
      if (id === gameId) els.dialog.showModal();
    }, 1400);
  }

  function renderPlayerBoard() {
    const board = state.player;
    const placing = state.phase === 'placement';
    player.el.classList.toggle('placing', placing);
    player.el.classList.toggle('in-battle', !placing);

    board.ships.forEach((s, i) => {
      if (!s.cells) return hideSprite(player, i);
      const extra = [];
      if (placing && i === state.selected) extra.push('selected');
      if (board.isSunk(i)) extra.push('sunk');
      if (state.healerFlash === 'player' && i === HEALER) extra.push('flash');
      drawSprite(player, i, s, s.cells[0][0], s.cells[0][1], s.horizontal, extra);
    });

    if (placing && state.selected !== null && state.hover) {
      const [hr, hc] = state.hover;
      const ok = board.canPlace(state.selected, hr, hc, state.horizontal);
      drawSprite(player, 'ghost', board.ships[state.selected], hr, hc, state.horizontal, ['ghost', ok ? 'ok' : 'bad']);
    } else {
      hideSprite(player, 'ghost');
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
        const el = player.cells[r][c];
        const cls = ['cell'];
        if (cell.ship !== -1) cls.push('ship');
        if (cell.ship !== -1 && board.isSunk(cell.ship)) cls.push('sunk');
        if (cell.hit) cls.push('shot', 'hit');
        else if (cell.shot) cls.push('shot', 'miss');
        else if (cell.repaired) cls.push('repaired');
        el.style.removeProperty('--heat');
        if (heat && !cell.hit && maxHeat > 0 && heat[r][c] > 0) {
          cls.push('heat');
          el.style.setProperty('--heat', (heat[r][c] / maxHeat).toFixed(3));
        }
        el.className = cls.join(' ');
      }
    }
    syncFires(player, board);
    setReticle(player, state.lastAiShot);
  }

  function renderEnemyBoard() {
    const board = state.enemy;
    const over = state.phase === 'over';
    enemy.el.classList.toggle('targetable', state.phase === 'battle' && !state.busy);

    board.ships.forEach((s, i) => {
      if (board.isSunk(i)) drawSprite(enemy, i, s, s.cells[0][0], s.cells[0][1], s.horizontal, ['sunk']);
      else if (over) drawSprite(enemy, i, s, s.cells[0][0], s.cells[0][1], s.horizontal, ['reveal']);
      else hideSprite(enemy, i);
    });

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = board.grid[r][c];
        const cls = ['cell'];
        if (cell.ship !== -1 && board.isSunk(cell.ship)) cls.push('sunk');
        if (cell.hit) cls.push('shot', 'hit');
        else if (cell.shot) cls.push('shot', 'miss');
        else if (cell.repaired) cls.push('repaired');
        if (state.pendingRefire && state.pendingRefire[0] === r && state.pendingRefire[1] === c) cls.push('armed');
        enemy.cells[r][c].className = cls.join(' ');
      }
    }
    syncFires(enemy, board);
    setReticle(enemy, state.lastPlayerShot);
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
        const label = showHits && s.healer && s.hits > 0 && !board.isSunk(i) ? `${s.name} (disabled)` : s.name;
        return `<li class="${board.isSunk(i) ? 'sunk' : ''}"><span>${label}</span>${pips(s, showHits)}</li>`;
      })
      .join('');
  }

  function renderDock() {
    els.dock.innerHTML = '';
    state.player.ships.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = [s.cells ? 'placed' : '', state.selected === i ? 'selected' : ''].join(' ');
      btn.innerHTML = `<span>${s.name} (${s.len})</span><span class="mini" style="--len:${s.len}">${shipSvg(s.name, s.len)}</span>`;
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
    const moves = state.phase === 'battle' && !state.busy && !midSalvo() ? state.player.healerMoves() : [];
    els.dpad.forEach((btn) => (btn.disabled = !moves.includes(btn.dataset.dir)));
    let status;
    if (state.player.isSunk(HEALER)) status = 'Sunk.';
    else if (healer.hits > 0) status = 'Hit — immobilized and can no longer repair for the rest of the game.';
    else if (state.phase === 'battle' && midSalvo()) status = 'Mobile, but you already started firing this turn.';
    else {
      const fire = state.player.fireNextTo(healer.cells);
      status = fire
        ? `Mobile. Next to a fire at ${coord(fire[0], fire[1])} — move along it to repair.`
        : 'Mobile. Move next to a burning ship to repair it.';
    }
    els.healerStatus.textContent = status;
  }

  function switchFleet() {
    const old = state.player;
    state.player = new Board(fleetOpts());
    state.enemy = new Board(fleetOpts());
    state.enemy.randomize();
    state.ai = new AI(els.difficulty.value, Math.random, fleetOpts());
    old.ships.forEach((s, i) => {
      if (s.cells && !s.healer && i < state.player.ships.length) state.player.place(i, s.cells[0][0], s.cells[0][1], s.horizontal);
    });
    Object.values(player.sprites).forEach((el) => el.remove());
    player.sprites = {};
    state.selected = nextUnplaced(-1);
    render();
  }

  function renderSalvo() {
    const show = isSalvo() && state.phase !== 'placement';
    els.salvoMeter.classList.toggle('hidden', !show);
    if (!show) return;
    const yourTurn = state.phase === 'battle' && (!state.busy || midSalvo());
    const total = yourTurn ? state.shotsTotal : state.player.salvoShots(state.turns.player === 0);
    const left = yourTurn ? state.shotsLeft : total;
    els.salvoShells.innerHTML = Array.from({ length: total }, (_, i) => `<span class="shell${i < left ? '' : ' spent'}"></span>`).join('');
    const enemyShots = state.enemy.salvoShots(state.turns.ai === 0);
    const enemyWhen = state.turns.ai === 0 ? 'on its first turn' : 'per turn';
    els.salvoText.textContent = state.phase === 'over'
      ? 'Game over.'
      : yourTurn
      ? `${left} of ${total} shots left this turn. Enemy fires ${enemyShots} ${enemyWhen}.`
      : `You'll have ${total} shots next turn. Enemy fires ${enemyShots} ${enemyWhen}.`;
  }

  function renderMode() {
    const locked = state && state.phase !== 'placement';
    els.modeButtons.forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.mode === mode));
      btn.disabled = locked;
    });
    els.modeBadge.classList.toggle('hidden', !isSalvo());
    els.healerToggle.classList.toggle('hidden', isSalvo());
    els.healerToggle.setAttribute('aria-checked', String(healerOn));
    els.healerToggle.disabled = locked;
    els.healerToggle.querySelector('.switch-state').textContent = healerOn ? 'On' : 'Off';
    els.modeHint.textContent = isSalvo()
      ? 'Salvo: five ships, no Healer. Each ship still afloat gives you a shot per turn, so losing ships cuts your firepower.'
      : healerOn
      ? 'Classic: one shot per turn, and each side has a Healer ship that can repair hits.'
      : 'Classic: one shot per turn with the standard five ships, no Healer.';
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
    renderSalvo();
    renderMode();
    els.healerControls.classList.toggle('hidden', !useHealer());
    els.healerRules.classList.toggle('hidden', !useHealer());
    if (state.phase !== 'placement' && useHealer()) renderHealerControls();
    const battle = state.phase === 'battle';
    els.enemyPanel.classList.toggle('active', battle && !state.busy);
    els.playerPanel.classList.toggle('active', battle && state.busy);
    const record = loadRecord();
    els.wins.textContent = record.wins;
    els.losses.textContent = record.losses;
  }

  function renderSoundToggle() {
    els.soundToggle.textContent = `Sound: ${Sound.enabled ? 'on' : 'off'}`;
    els.soundToggle.setAttribute('aria-pressed', String(Sound.enabled));
  }

  player = buildBoard($('#player-board'));
  enemy = buildBoard($('#enemy-board'));

  player.el.addEventListener('click', onPlayerBoardClick);
  player.el.addEventListener('mouseover', (e) => {
    const pos = cellFromEvent(e);
    if (state.phase !== 'placement' || !pos) return;
    state.hover = pos;
    renderPlayerBoard();
  });
  player.el.addEventListener('mouseleave', () => {
    state.hover = null;
    renderPlayerBoard();
  });
  player.el.addEventListener('contextmenu', (e) => {
    if (state.phase !== 'placement') return;
    e.preventDefault();
    rotate();
  });
  enemy.el.addEventListener('click', onEnemyBoardClick);

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
  els.modeButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      if (state.phase !== 'placement' || btn.dataset.mode === mode) return;
      mode = btn.dataset.mode;
      localStorage.setItem(MODE_KEY, mode);
      switchFleet();
    }),
  );
  els.healerToggle.addEventListener('click', () => {
    if (state.phase !== 'placement' || isSalvo()) return;
    healerOn = !healerOn;
    localStorage.setItem(HEALER_KEY, healerOn ? 'on' : 'off');
    switchFleet();
  });
  els.soundToggle.addEventListener('click', () => {
    Sound.toggle();
    renderSoundToggle();
  });
  $('#new-game').addEventListener('click', () => {
    if (state.phase === 'battle' && !confirm('Abandon the current game?')) return;
    newGame();
  });
  $('#play-again').addEventListener('click', newGame);
  $('#review').addEventListener('click', () => els.dialog.close());
  els.difficulty.addEventListener('change', () => {
    if (state.phase === 'placement') state.ai.difficulty = els.difficulty.value;
  });

  renderSoundToggle();
  newGame();
})();
