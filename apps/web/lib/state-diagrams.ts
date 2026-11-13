import type { StateMachine } from '@northbook/shared';

export type DiagramPalette = Record<
  'paper' | 'ink' | 'muted' | 'line-strong' | 'forest' | 'emerald' | 'positive-bg' | 'danger' | 'danger-bg',
  string
>;
export function diagramPalette(css: string): DiagramPalette {
  const names = [
    'paper',
    'ink',
    'muted',
    'line-strong',
    'forest',
    'emerald',
    'positive-bg',
    'danger',
    'danger-bg',
  ] as const;
  return Object.fromEntries(
    names.map((name) => {
      const value = css.match(new RegExp(`--color-${name}:\\s*(#[a-fA-F0-9]{6})\\s*;`))?.[1];
      if (!value) throw new Error(`Missing diagram token: ${name}`);
      return [name, value];
    }),
  ) as DiagramPalette;
}
const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1).replaceAll('_', ' ');

// Presentation follows the first forward path; remaining states branch below it.
// Every edge is rendered, including back edges and any future terminal states.
export function stateDiagramSvg(title: string, machine: StateMachine<string>, colors: DiagramPalette) {
  const primary: string[] = [machine.initial];
  while (primary.length < machine.states.length) {
    const next = machine.transitions.find(
      (edge) => edge.from === primary.at(-1) && !primary.includes(edge.to),
    );
    if (!next) break;
    primary.push(next.to);
  }
  const width = Math.ceil(Math.max(140, ...machine.states.map((state) => label(state).length * 7.2 + 36)));
  const positions = new Map(primary.map((state, index) => [state, { x: 24 + index * (width + 130), y: 48 }]));
  machine.states
    .filter((state) => !positions.has(state))
    .forEach((state, index) => {
      const parent = machine.transitions.find((edge) => edge.to === state && positions.has(edge.from));
      positions.set(state, { x: parent ? positions.get(parent.from)!.x : 24, y: 180 + index * 120 });
    });
  const svgWidth = Math.max(...[...positions.values()].map((point) => point.x + width)) + 24;
  const svgHeight = Math.max(...[...positions.values()].map((point) => point.y)) + 76;
  const description = machine.transitions
    .map((edge) => `${label(edge.from)} → ${label(edge.to)}: ${label(edge.event)} (${edge.actor}).`)
    .join(' ');
  const edges = machine.transitions
    .map((edge, index) => {
      const from = positions.get(edge.from)!,
        to = positions.get(edge.to)!;
      const horizontal = from.y === to.y && to.x > from.x;
      const x1 = horizontal ? from.x + width : from.x + width / 2,
        y1 = horizontal ? from.y + 22 : from.y + 44;
      const x2 = horizontal ? to.x : to.x + width / 2,
        y2 = horizontal ? to.y + 22 : to.y;
      const x = horizontal ? (x1 + x2) / 2 : Math.max(x1, x2) + 12,
        y = horizontal ? y1 - 12 : (y1 + y2) / 2;
      const path = horizontal
        ? `M${x1} ${y1}H${x2 - 4}`
        : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2 - 4}`;
      return `<g data-from="${escape(edge.from)}" data-to="${escape(edge.to)}" data-event="${escape(edge.event)}" data-actor="${edge.actor}"><path id="edge-${index}" d="${path}" fill="none" stroke="${colors.muted}" stroke-width="1.5" marker-end="url(#arrow)"/><text x="${x}" y="${y}" text-anchor="${horizontal ? 'middle' : 'start'}" font-size="11" fill="${colors.muted}">${escape(label(edge.event))}</text><text x="${x}" y="${y + 15}" text-anchor="${horizontal ? 'middle' : 'start'}" font-size="10" fill="${colors.muted}">${edge.actor}</text></g>`;
    })
    .join('\n');
  const nodes = machine.states
    .map((state) => {
      const { x, y } = positions.get(state)!;
      const positive = ['accepted', 'settled', 'approved'].includes(state),
        negative = ['expired', 'cancelled', 'rejected'].includes(state);
      return `<g data-state="${escape(state)}"><rect x="${x}" y="${y}" width="${width}" height="44" rx="22" fill="${positive ? colors['positive-bg'] : negative ? colors['danger-bg'] : colors.paper}" stroke="${state === machine.initial ? colors.forest : colors['line-strong']}" stroke-width="${state === machine.initial ? 1.5 : 1}"/><text x="${x + width / 2}" y="${y + 27}" text-anchor="middle" font-size="14" font-weight="500" fill="${positive ? colors.emerald : negative ? colors.danger : colors.ink}">${escape(label(state))}</text></g>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-labelledby="diagram-title diagram-description" font-family="Geist Sans,system-ui,sans-serif"><title id="diagram-title">${escape(title)}</title><desc id="diagram-description">${escape(description)}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="${colors.muted}" stroke-width="1.5"/></marker></defs>\n${edges}\n${nodes}\n</svg>\n`;
}
