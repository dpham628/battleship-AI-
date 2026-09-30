# Battleship vs AI

Browser Battleship against an AI opponent. No build step or dependencies: serve the folder with any static server (e.g. `python3 -m http.server 8080`) and open http://localhost:8080.

## Rules
- 10x10 board, six ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2), Healer (2).
- On your turn you either **fire** at Enemy Waters or **move your Healer** one square (arrow keys or the on-screen pad). The Healer can't rotate and can only move into cells the enemy hasn't fired at.
- If the Healer ends a move touching a hit cell of a ship that isn't sunk, it puts out that fire: the hit is repaired and can be targeted again. Repairs are announced.
- One hit on the Healer immobilizes it for the rest of the game; two hits sink it.
- Sink all six enemy ships to win.

## AI difficulty
- **Easy**: mostly random shots, uses its Healer rarely.
- **Normal**: hunt/target with checkerboard parity.
- **Hard**: probability-density targeting over every legal placement of the remaining ships; hunts around repaired cells to find your Healer.

## Tests
`node sim.test.js` runs Healer rule unit tests plus AI simulations (solo and AI-vs-AI with Healers).
