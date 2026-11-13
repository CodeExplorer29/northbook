import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { quoteMachine, tradeMachine, kybMachine } from '../packages/shared/src/state-machines.js';
import { diagramPalette, stateDiagramSvg } from '../apps/web/lib/state-diagrams.js';
const root = new URL('../apps/web/', import.meta.url);
const colors = diagramPalette(await readFile(new URL('app/tokens.css', root), 'utf8'));
await mkdir(new URL('public/diagrams/', root), { recursive: true });
for (const [name, machine] of [
  ['quote', quoteMachine],
  ['trade', tradeMachine],
  ['kyb', kybMachine],
] as const) {
  await writeFile(
    new URL(`public/diagrams/${name}.svg`, root),
    stateDiagramSvg(`${name.toUpperCase()} lifecycle`, machine, colors),
  );
}
