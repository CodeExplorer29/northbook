import styles from './tokens.module.css';

const colours = [
  'paper',
  'surface',
  'ink',
  'muted',
  'line',
  'line-strong',
  'forest',
  'emerald',
  'mint',
  'night',
  'danger',
  'positive-bg',
  'neutral-bg',
  'danger-bg',
  'on-dark',
  'on-dark-muted',
  'on-dark-faint',
  'on-dark-line',
  'on-dark-control-line',
];
const types = [
  'display-xl',
  'section',
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'small',
  'dense',
  'eyebrow',
  'amount-xl',
  'amount-lg',
  'amount-md',
];

export default function TokensPage() {
  return (
    <main className={styles.gallery}>
      <header className={styles.intro}>
        <p className="eyebrow">Northbook / Design system</p>
        <h1 className="type-h1">A clear visual language.</h1>
        <p className={styles.muted}>Colour, typography and controls for an exact, deliberate workflow.</p>
      </header>
      <section aria-labelledby="colours-heading" className={styles.section}>
        <h2 id="colours-heading" className="type-h2">
          Colour
        </h2>
        <div className={styles.colours}>
          {colours.map((colour) => (
            <div key={colour} className={styles.colour}>
              <div className={`${styles.swatchBase} ${colour.startsWith('on-dark') ? styles.darkBase : ''}`}>
                <div
                  className={`${styles.swatch} swatch-${colour}`}
                  data-colour={colour}
                  aria-hidden="true"
                />
              </div>
              <span className="figure">{colour}</span>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="type-heading" className={styles.section}>
        <h2 id="type-heading" className="type-h2">
          Typography
        </h2>
        <div>
          {types.map((type) => (
            <div key={type} className={styles.typeRow}>
              <span className={`${styles.typeLabel} figure`}>{type}</span>
              <p
                data-type={type}
                className={`type-${type} ${type.startsWith('amount') || type === 'eyebrow' ? 'figure' : ''}`}
              >
                {type.startsWith('amount')
                  ? '207,892.50 CAD'
                  : type === 'eyebrow'
                    ? 'OTC TRADING'
                    : 'Priced to the last cent.'}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="controls-heading" className={styles.section}>
        <h2 id="controls-heading" className="type-h2">
          Controls and status
        </h2>
        <div className={styles.controls}>
          <button className="button-primary" data-contrast="primary">
            Accept quote
          </button>
          <button className="button-secondary" data-contrast="secondary">
            Request new quote
          </button>
          <button className="button-danger" data-contrast="danger-button">
            Cancel trade
          </button>
          <button className="button-primary" disabled>
            Accepting…
          </button>
        </div>
        <div className={styles.controls}>
          <span className="chip chip-positive" data-contrast="positive">
            Settled
          </span>
          <span className="chip chip-neutral" data-contrast="neutral">
            Awaiting client funds
          </span>
          <span className="chip chip-danger" data-contrast="danger">
            Expired
          </span>
          <span className="chip chip-indicative" data-contrast="indicative">
            Indicative
          </span>
          <span className={styles.muted} data-contrast="muted">
            All amounts are in CAD.
          </span>
        </div>
        <div className={`${styles.darkPanel} band-dark`}>
          <div>
            <p className="type-h2" data-contrast="on-dark">
              Bespoke pricing for meaningful size.
            </p>
            <p className={styles.onDarkMuted} data-contrast="on-dark-muted">
              One all-in price. A clear next step.
            </p>
          </div>
          <div className={styles.controls}>
            <button className="button-primary-on-dark" data-contrast="primary-on-dark">
              Get started
            </button>
            <button className="button-secondary-on-dark" data-contrast="secondary-on-dark">
              See how it works
            </button>
          </div>
        </div>
        <div className="bg-nb-surface text-nb-ink rounded-nb-card p-6" data-testid="tailwind-tokens">
          Tailwind uses the same Northbook tokens.
        </div>
      </section>
    </main>
  );
}
