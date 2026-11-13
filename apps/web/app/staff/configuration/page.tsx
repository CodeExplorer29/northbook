'use client';

import {
  configurationSchema,
  configurationUpdate,
  configurationUpdateSchema,
  Money,
  venueHealthSchema,
  type Configuration,
} from '@northbook/shared';
import { useRef, useState } from 'react';
import { useSession } from '../../../components/demo-session';
import { DataTable, StatusChip } from '../../../components/data-display';
import { EmptyState } from '../../../components/feedback';
import { ResourceFailure } from '../../../components/feedback';
import { api } from '../../../lib/api';
import { useResource } from '../../../lib/use-resource';
import { useNow } from '../../../lib/use-now';
import styles from './configuration.module.css';

const venueParser = venueHealthSchema.array();
const bandLabels = ['Under 100k CAD', '100k to 500k CAD', 'Over 500k CAD'];
function fields(config: Configuration): Record<string, string | boolean> {
  return Object.fromEntries([
    ...Object.entries(config.settings).map(([key, value]) => [key, String(value)]),
    ...config.spreadBands.map((row) => [`spread:${row.tier}:${row.band}`, row.bps]),
    ...config.organisations.flatMap((org) => [
      [`tier:${org.id}`, org.tier],
      [`max:${org.id}`, org.maxTradeSize],
    ]),
    ...config.venues.map((venue) => [`venue:${venue.id}`, venue.enabled]),
  ]);
}
function Editor({ initial }: { initial: Configuration }) {
  const [base, setBase] = useState(initial),
    [values, setValues] = useState(() => fields(initial));
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<unknown>(null),
    [validation, setValidation] = useState<string[]>([]),
    [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const now = useNow();
  const health = useResource('/staff/venues', venueParser, 2000);
  const original = fields(base),
    changed = Object.keys(original).filter((key) => values[key] !== original[key]);
  function set(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    setValidation([]);
    setSaved(false);
  }
  function numeric(key: string, label: string, wide = false) {
    return (
      <input
        aria-label={label}
        inputMode="decimal"
        className={`${styles.input} ${wide ? styles.wide : ''} ${changed.includes(key) ? styles.changed : ''}`}
        value={String(values[key])}
        disabled={busy}
        onChange={(event) => set(key, event.target.value)}
      />
    );
  }
  async function save(discard = false) {
    if (lock.current) return;
    const candidate = {
      ...configurationUpdate(base),
      settings: {
        quoteLifetimeSeconds: /^\d+$/.test(String(values.quoteLifetimeSeconds))
          ? Number(values.quoteLifetimeSeconds)
          : NaN,
        minimumTradeCad: values.minimumTradeCad,
        referenceSpreadBps: values.referenceSpreadBps,
      },
      spreadBands: base.spreadBands.map((row) => ({ ...row, bps: values[`spread:${row.tier}:${row.band}`] })),
      organisations: base.organisations.map((org) => ({
        id: org.id,
        tier: values[`tier:${org.id}`],
        maxTradeSize: values[`max:${org.id}`],
      })),
      venues: base.venues.map((venue) => ({ id: venue.id, enabled: values[`venue:${venue.id}`] })),
    };
    const parsed = configurationUpdateSchema.safeParse(candidate);
    if (!discard && !parsed.success) {
      setValidation(parsed.error.issues.map((issue) => `${issue.path.join(' · ')}: ${issue.message}`));
      return;
    }
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = configurationSchema.parse(
        await api('/staff/config', discard ? {} : { method: 'PUT', body: JSON.stringify(parsed.data) }),
      );
      setBase(result);
      setValues(fields(result));
      setValidation([]);
      setSaved(!discard);
      void health.refreshAfterWrite().catch(() => {});
    } catch (error) {
      setFailure(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Configuration</h1>
          <p>Changes apply to new quotes only. Quotes already shown keep their price.</p>
        </div>
        <span role="status">{saved ? 'Configuration saved.' : 'Shared demo configuration'}</span>
      </div>
      <ResourceFailure error={failure} retry={() => save()} />
      {validation.length > 0 && (
        <div role="alert" className={styles.validation}>
          <strong>Check these values before saving.</strong>
          <ul>
            {validation.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.grid}>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="spreads-title">
            <div className={styles.cardHeading}>
              <h2 id="spreads-title">Spreads</h2>
              <span>Basis points by tier and trade size</span>
            </div>
            <DataTable
              dense
              label="Spreads"
              rows={['Tier 1', 'Standard']}
              rowKey={(tier) => tier}
              columns={[
                { key: 'tier', heading: 'Tier', render: (tier) => tier },
                ...bandLabels.map((label, band) => ({
                  key: String(band),
                  heading: label,
                  numeric: true,
                  render: (tier: string) =>
                    numeric(
                      `spread:${tier}:${band}`,
                      `${tier}, ${label[0]!.toLowerCase() + label.slice(1)}, bps`,
                    ),
                })),
              ]}
            />
            <p className={styles.note}>
              Spreads increase the client’s BUY price and decrease the SELL price. Size bands use pre-spread
              market value in CAD.
            </p>
          </section>
          <section className={styles.card} aria-labelledby="organisations-title">
            <div className={styles.cardHeading}>
              <h2 id="organisations-title">Organisations</h2>
              <span>{base.organisations.length} organisations</span>
            </div>
            <DataTable
              dense
              label="Organisation settings"
              rows={base.organisations}
              rowKey={(org) => org.id}
              columns={[
                { key: 'name', heading: 'Organisation', render: (org) => org.name },
                {
                  key: 'kyb',
                  heading: 'KYB',
                  render: (org) => (
                    <StatusChip
                      dense
                      tone={
                        org.kybState === 'approved'
                          ? 'positive'
                          : org.kybState === 'rejected'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {org.kybState[0]!.toUpperCase() + org.kybState.slice(1)}
                    </StatusChip>
                  ),
                },
                {
                  key: 'tier',
                  heading: 'Tier',
                  render: (org) => (
                    <select
                      aria-label={`${org.name} tier`}
                      className={changed.includes(`tier:${org.id}`) ? styles.changed : undefined}
                      value={String(values[`tier:${org.id}`])}
                      disabled={busy}
                      onChange={(event) => set(`tier:${org.id}`, event.target.value)}
                    >
                      <option>Tier 1</option>
                      <option>Standard</option>
                    </select>
                  ),
                },
                {
                  key: 'max',
                  heading: 'Maximum trade (CAD)',
                  numeric: true,
                  render: (org) => numeric(`max:${org.id}`, `${org.name} maximum trade`, true),
                },
              ]}
            />
          </section>
        </div>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="settings-title">
            <div className={styles.cardHeading}>
              <h2 id="settings-title">Quote settings</h2>
            </div>
            {[
              ['quoteLifetimeSeconds', 'Quote lifetime', 'Seconds a firm quote stays valid · 5 to 120', 's'],
              ['minimumTradeCad', 'Minimum trade', 'Smallest firm quote, in CAD equivalent', 'CAD'],
              [
                'referenceSpreadBps',
                'Public reference spread',
                'Applied to indicative prices on Home',
                'bps',
              ],
            ].map(([key, label, hint, unit]) => (
              <div key={key} className={styles.row}>
                <div>
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </div>
                <div className={styles.control}>
                  {numeric(key!, label!, key === 'minimumTradeCad')}
                  <span>{unit}</span>
                </div>
              </div>
            ))}
          </section>
          <section className={styles.card} aria-labelledby="venues-title">
            <div className={styles.cardHeading}>
              <h2 id="venues-title">Venues</h2>
              <span>Order books used for routing</span>
            </div>
            <ResourceFailure error={health.error} retry={health.refresh} />
            {base.venues.map((venue) => {
              const status = health.data?.find((item) => item.id === venue.id);
              const name = venue.id[0]!.toUpperCase() + venue.id.slice(1);
              const key = `venue:${venue.id}`;
              const age =
                status?.lastUpdate === null || status?.lastUpdate === undefined
                  ? null
                  : Math.max(0, Math.floor((now - status.lastUpdate) / 1000));
              return (
                <div
                  key={venue.id}
                  className={`${styles.row} ${changed.includes(key) ? styles.changed : ''}`}
                >
                  <div className={styles.venue}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={values[key] === true}
                      aria-label={`Use ${name} for routing`}
                      className={styles.switch}
                      disabled={busy}
                      onClick={() => set(key, !values[key])}
                    >
                      <span />
                    </button>
                    <div>
                      <strong>{name}</strong>
                      <span>
                        {status
                          ? `${status.markets} markets${status.replayed ? ' · replay' : ''}`
                          : 'Loading status…'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.health}>
                    <strong>
                      {status ? status.status[0]!.toUpperCase() + status.status.slice(1) : 'Unknown'}
                    </strong>
                    <span>
                      {age === null ? (
                        'No current data'
                      ) : (
                        <>
                          Last update <span className="figure">{age}s</span> ago
                        </>
                      )}
                    </span>
                    {changed.includes(key) && <span>Unsaved selection</span>}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </div>
      {changed.length > 0 && (
        <div className={styles.saveBar} role="region" aria-label="Unsaved changes">
          <span>
            <span className="figure">{new Money(changed.length).toFixed()}</span> unsaved{' '}
            {changed.length === 1 ? 'change' : 'changes'}
          </span>
          <div>
            <button
              type="button"
              className="button-secondary-on-dark"
              disabled={busy}
              onClick={() => {
                void save(true);
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className={styles.save}
              disabled={busy}
              onClick={() => {
                void save();
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function ConfigurationContent() {
  const resource = useResource('/staff/config', configurationSchema);
  return resource.data ? (
    <>
      <ResourceFailure error={resource.error} retry={resource.refresh} />
      <Editor initial={resource.data} />
    </>
  ) : (
    <>
      <h1>Configuration</h1>
      <ResourceFailure error={resource.error} retry={resource.refresh} />
      <DataTable
        label="Configuration"
        rows={[]}
        columns={[
          { key: 'setting', heading: 'Setting', render: () => null },
          { key: 'value', heading: 'Value', render: () => null },
        ]}
        rowKey={() => ''}
        loading={resource.loading}
        empty={<EmptyState message="Configuration is unavailable." />}
      />
    </>
  );
}
export default function ConfigurationPage() {
  const { persona, loading, openPersonas } = useSession();
  return (
    <div className={styles.background}>
      <main className={styles.page}>
        {loading ? (
          <>
            <h1>Configuration</h1>
            <DataTable
              label="Loading configuration"
              rows={[]}
              columns={[{ key: 'setting', heading: 'Setting', render: () => null }]}
              rowKey={() => ''}
              loading
            />
          </>
        ) : persona?.user.role === 'staff' ? (
          <ConfigurationContent />
        ) : (
          <>
            <h1>Configuration</h1>
            <EmptyState message="Choose the staff persona to configure pricing." />
            <button className="button-primary" onClick={openPersonas}>
              Choose persona
            </button>
          </>
        )}
      </main>
    </div>
  );
}
