(function (root) {
  'use strict';

  const DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="g-hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a9b4c1"/><stop offset="0.5" stop-color="#848f9d"/><stop offset="1" stop-color="#58616d"/>
    </linearGradient>
    <linearGradient id="g-deck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9c2cc"/><stop offset="1" stop-color="#8f9aa7"/>
    </linearGradient>
    <linearGradient id="g-flight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#626b76"/><stop offset="1" stop-color="#474f59"/>
    </linearGradient>
    <linearGradient id="g-super" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d3dae2"/><stop offset="1" stop-color="#8b96a3"/>
    </linearGradient>
    <radialGradient id="g-turret" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#c5cdd6"/><stop offset="1" stop-color="#6c7784"/>
    </radialGradient>
    <linearGradient id="g-sub" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5d6875"/><stop offset="0.5" stop-color="#3f4854"/><stop offset="1" stop-color="#262c34"/>
    </linearGradient>
    <linearGradient id="g-healer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e3e8ee"/><stop offset="1" stop-color="#aeb8c4"/>
    </linearGradient>
  </defs>
</svg>`;

  function hull(W, b, bow, stern = 10, tip = 4) {
    const t = 50 - b;
    const u = 50 + b;
    return `M ${stern},${t + 7} Q ${stern},${t} ${stern + 10},${t} L ${W - bow},${t}
      C ${W - bow * 0.4},${t} ${W - tip - 8},${50 - b * 0.35} ${W - tip},50
      C ${W - tip - 8},${50 + b * 0.35} ${W - bow * 0.4},${u} ${W - bow},${u}
      L ${stern + 10},${u} Q ${stern},${u} ${stern},${u - 7} Z`;
  }

  function base(W, b, bow, hullFill = 'url(#g-hull)', deckFill = 'url(#g-deck)') {
    return `<path d="${hull(W, b, bow)}" fill="${hullFill}" stroke="#262c33" stroke-width="3"/>
      <path d="${hull(W, b - 7, bow + 6, 18, 16)}" fill="${deckFill}"/>`;
  }

  function turret(x, dir = 1, r = 12, len = 34) {
    const bx = dir > 0 ? x : x - len;
    return `<g>
      <rect x="${bx}" y="45" width="${len}" height="3.4" rx="1.7" fill="#353d46"/>
      <rect x="${bx}" y="51.6" width="${len}" height="3.4" rx="1.7" fill="#353d46"/>
      <circle cx="${x}" cy="50" r="${r}" fill="url(#g-turret)" stroke="#2b323a" stroke-width="2"/>
      <circle cx="${x - r * 0.3}" cy="${50 - r * 0.3}" r="${r * 0.3}" fill="#ffffff40"/>
    </g>`;
  }

  function funnel(cx, rx = 13, ry = 9) {
    return `<ellipse cx="${cx}" cy="50" rx="${rx}" ry="${ry}" fill="#4a525c" stroke="#2b323a" stroke-width="1.5"/>
      <ellipse cx="${cx}" cy="50" rx="${rx * 0.6}" ry="${ry * 0.55}" fill="#15191e"/>`;
  }

  function block(x, y, w, h, rx = 4) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#g-super)" stroke="#3b434c" stroke-width="1.5"/>`;
  }

  function plane(x, y, rot = 0) {
    return `<g transform="translate(${x},${y}) rotate(${rot})" stroke="#c9d1da" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M -11,0 L 12,0"/><path d="M 3,-11 L 6,0 L 3,11"/><path d="M -9,-5 L -7,0 L -9,5"/>
    </g>`;
  }

  const ART = {
    Carrier: () => `
      ${base(500, 40, 90)}
      <path d="M 22,17 L 410,14 Q 470,24 484,50 Q 470,76 410,86 L 22,86 Q 16,86 16,80 L 16,23 Q 16,17 22,17 Z" fill="url(#g-flight)" stroke="#2b323a" stroke-width="2"/>
      <line x1="34" y1="66" x2="468" y2="50" stroke="#e8edf2" stroke-width="2.4" stroke-dasharray="14 10"/>
      <line x1="34" y1="80" x2="300" y2="30" stroke="#f3c64d" stroke-width="1.6" opacity="0.7"/>
      <line x1="24" y1="22" x2="408" y2="19" stroke="#e8edf2" stroke-width="1.2" opacity="0.5"/>
      ${plane(90, 36)}${plane(135, 36)}${plane(180, 36)}${plane(250, 72, -8)}
      ${block(300, 4, 74, 20, 4)}
      <rect x="340" y="8" width="22" height="12" rx="2" fill="#6b7581"/>
      <circle cx="322" cy="14" r="5" fill="#39414b"/>`,

    Battleship: () => `
      ${base(400, 34, 80)}
      ${turret(62, -1, 13, 36)}
      ${block(108, 34, 118, 32, 6)}
      ${funnel(150, 14, 10)}
      ${block(186, 38, 34, 24, 5)}
      <line x1="200" y1="50" x2="236" y2="50" stroke="#3b434c" stroke-width="2"/>
      <circle cx="122" cy="27" r="4" fill="#6c7784"/><circle cx="172" cy="27" r="4" fill="#6c7784"/><circle cx="212" cy="27" r="4" fill="#6c7784"/>
      <circle cx="122" cy="73" r="4" fill="#6c7784"/><circle cx="172" cy="73" r="4" fill="#6c7784"/><circle cx="212" cy="73" r="4" fill="#6c7784"/>
      ${turret(268, 1, 13, 36)}
      ${turret(322, 1, 12, 32)}`,

    Cruiser: () => `
      ${base(300, 30, 70)}
      ${turret(46, -1, 11, 30)}
      ${block(84, 37, 92, 26, 5)}
      ${funnel(112, 11, 8)}
      ${block(144, 40, 28, 20, 4)}
      ${turret(210, 1, 11, 30)}`,

    Submarine: () => `
      <path d="M 12,50 C 12,34 34,30 70,30 L 226,30 C 272,30 294,40 294,50 C 294,60 272,70 226,70 L 70,70 C 34,70 12,66 12,50 Z" fill="url(#g-sub)" stroke="#161a1f" stroke-width="3"/>
      <line x1="40" y1="50" x2="270" y2="50" stroke="#6b7684" stroke-width="1.5" opacity="0.6"/>
      <rect x="10" y="36" width="10" height="28" rx="3" fill="#2a3038"/>
      <rect x="160" y="30" width="12" height="40" rx="4" fill="#2a3038"/>
      <rect x="146" y="41" width="50" height="18" rx="9" fill="#2d343d" stroke="#161a1f" stroke-width="2"/>
      <circle cx="186" cy="50" r="3" fill="#8a96a3"/>
      <circle cx="96" cy="50" r="4" fill="#2a3038"/><circle cx="240" cy="50" r="4" fill="#2a3038"/>`,

    Destroyer: () => `
      ${base(200, 26, 60)}
      ${turret(34, -1, 8, 22)}
      ${funnel(70, 10, 7)}
      ${block(86, 40, 34, 20, 4)}
      ${turret(142, 1, 10, 28)}`,

    Healer: () => `
      ${base(200, 32, 52, 'url(#g-healer)', '#dfe5eb')}
      <rect x="16" y="23" width="130" height="5" rx="2" fill="#d7263d"/>
      <rect x="16" y="72" width="130" height="5" rx="2" fill="#d7263d"/>
      <rect x="40" y="33" width="66" height="34" rx="7" fill="#f6f8fa" stroke="#8d97a3" stroke-width="2"/>
      <rect x="66" y="37" width="14" height="26" rx="2" fill="#d7263d"/>
      <rect x="60" y="43" width="26" height="14" rx="2" fill="#d7263d"/>
      <circle cx="136" cy="50" r="9" fill="#d7263d" stroke="#8f1424" stroke-width="2"/>
      <rect x="136" y="47" width="30" height="6" rx="3" fill="#b3bcc6"/>
      <circle cx="26" cy="50" r="5" fill="#d7263d"/>`,
  };

  function shipSvg(name, len) {
    const art = ART[name];
    return `<svg class="ship-svg" viewBox="0 0 ${len * 100} 100" preserveAspectRatio="none" aria-hidden="true">${art ? art() : base(len * 100, 30, 60)}</svg>`;
  }

  document.body.insertAdjacentHTML('afterbegin', DEFS);
  root.ShipArt = { shipSvg };
})(window);
