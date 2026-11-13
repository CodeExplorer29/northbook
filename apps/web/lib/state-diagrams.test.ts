import { readFile } from 'node:fs/promises';
import { quoteMachine, tradeMachine, kybMachine, type StateMachine } from '@northbook/shared';
import { expect, it } from 'vitest';
import { diagramPalette, stateDiagramSvg } from './state-diagrams.js';
it('generates every state, transition and actor from each implementation table using approved tokens', async () => {
  const colors = diagramPalette(await readFile('apps/web/app/tokens.css', 'utf8'));
  for (const [name, machine] of [
    ['quote', quoteMachine],
    ['trade', tradeMachine],
    ['kyb', kybMachine],
  ] as const) {
    const svg = stateDiagramSvg(`${name.toUpperCase()} lifecycle`, machine, colors);
    for (const state of machine.states) expect(svg).toContain(`data-state="${state}"`);
    for (const edge of machine.transitions)
      expect(svg).toContain(
        `data-from="${edge.from}" data-to="${edge.to}" data-event="${edge.event}" data-actor="${edge.actor}"`,
      );
    expect(await readFile(`apps/web/public/diagrams/${name}.svg`, 'utf8')).toBe(svg);
  }
  const extended: StateMachine<string> = {
    ...quoteMachine,
    states: [...quoteMachine.states, 'reviewed'],
    transitions: [
      ...quoteMachine.transitions,
      { from: 'accepted', event: 'review', to: 'reviewed', actor: 'staff' },
    ],
  };
  expect(stateDiagramSvg('Changed table', extended, colors)).toContain('data-state="reviewed"');
  expect(stateDiagramSvg('Changed table', extended, colors)).toContain('data-event="review"');
});
it('escapes generated SVG text and refuses a missing palette token', async () => {
  const colors = diagramPalette(await readFile('apps/web/app/tokens.css', 'utf8'));
  const svg = stateDiagramSvg('<script>"unsafe"</script>', quoteMachine, colors);
  expect(svg).not.toContain('<script>');
  expect(svg).toContain('&lt;script&gt;');
  expect(() => diagramPalette('')).toThrow('Missing diagram token');
});
