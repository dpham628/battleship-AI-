# Battleship vs AI

Browser Battleship against an AI opponent. No build step or dependencies: serve the folder with any static server (e.g. `python3 -m http.server 8080`) and open http://localhost:8080.

## Rules
- 10x10 board, six ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2), Healer (2).
- On your turn you either **fire** at Enemy Waters or **move your Healer** one square (arrow keys or the on-screen pad) or **rotate** it (`R` or the ⟳ button; it pivots on one of its cells). The Healer can't pass through ships or hits, but it can move over the enemy's missed shots. Because of that, you may fire again at a cell you missed (click it twice to confirm).
- The Healer is optional in Classic: switch **Healer ship** off in the setup panel to play with the standard five ships.
- If the Healer ends a move or rotation touching a hit cell of a ship that isn't sunk, it puts out that fire: the hit is repaired and can be targeted again. Repairs are announced.
- One hit on the Healer disables it for the rest of the game (no moving, rotating, or repairing); two hits sink it. The shooter isn't told a hit landed on a Healer; it's only named once sunk, like any ship.
- Sink the five enemy warships to win. The Healer doesn't have to be sunk: if it's the last ship left, that fleet has lost.

## AI difficulty
- **Easy**: mostly random shots, uses its Healer rarely.
- **Normal**: hunt/target with checkerboard parity.
- **Hard**: probability-density targeting over every legal placement of the remaining ships; hunts around repaired cells (including old misses) to find your Healer.

## Tests
`node sim.test.js` runs Healer rule unit tests plus AI simulations (solo and AI-vs-AI with Healers).

## Salvo mode

Pick **Classic** or **Salvo** at the top of the setup panel before the battle starts. Salvo uses the standard five-ship fleet with **no Healer** on either side. You get one shot per turn for each of your ships still afloat. Each side's first turn is always a full 5 shots, so going second isn't punished if the opening salvo sinks something. Each shot resolves as you fire it, and the turn ends after the last one. The AI follows the same rules.

## Graphics and sound

Ships are top-down SVG warships drawn in `js/ships.js`: Carrier, Battleship, Cruiser, Submarine, Destroyer, and a white fireboat for the Healer. Shots fly in, then hits burst into flames and misses splash. Sunk ships list and darken, and the board shakes. The Healer slides when it moves and swings round when it rotates. Every few seconds a shark swims across one of the boards (decoration only; it never reveals or blocks anything). Easter egg: if your shell lands on a passing shark it blows up and sushi rains down the screen; the shot still counts as a normal hit or miss. Sound effects are generated with the Web Audio API and can be turned off with the Sound button. Animations are reduced when the OS "reduce motion" setting is on.
