'use client';

import {
  kybApplicationSchema,
  kybRejectionSchema,
  Money,
  staffKybApplicationSchema,
} from '@northbook/shared';
import { useRef, useState } from 'react';
import { useSession } from '../../../components/demo-session';
import { DataTable, FilterPills, StatusChip } from '../../../components/data-display';
import { EmptyState } from '../../../components/feedback';
import { ResourceFailure } from '../../../components/feedback';
import { api, ApiError, errorMessage } from '../../../lib/api';
import { formatDecimal } from '../../../lib/format-money';
import { useResource } from '../../../lib/use-resource';
import styles from './approvals.module.css';

const parser = staffKybApplicationSchema.array();
type Application = ReturnType<typeof staffKybApplicationSchema.parse>;
const label = (state: Application['state']) =>
  ({ draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' })[state];
function State({ state }: { state: Application['state'] }) {
  return (
    <StatusChip dense tone={state === 'approved' ? 'positive' : state === 'rejected' ? 'danger' : 'neutral'}>
      {label(state)}
    </StatusChip>
  );
}
function DateTime({ value }: { value: string | null }) {
  return value ? (
    <time className="figure" dateTime={value}>
      {value.slice(0, 10)} {value.slice(11, 16)} UTC
    </time>
  ) : (
    <>Not submitted</>
  );
}
function ApplicationPanel({
  application,
  refresh,
  busy,
  setBusy,
}: {
  application: Application;
  refresh: () => Promise<void>;
  busy: boolean;
  setBusy: (value: boolean) => void;
}) {
  const [rejecting, setRejecting] = useState(false),
    [reason, setReason] = useState(''),
    [failure, setFailure] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{ body: string; action: string; key: string } | null>(null);
  const { persona } = useSession();
  const [confirmed, setConfirmed] = useState<Application | null>(null);
  const current = confirmed ?? application;
  const total = current.beneficialOwners.reduce<InstanceType<typeof Money> | null>((sum, owner) => {
    try {
      return sum && new Money(owner.ownership).isFinite() ? sum.plus(owner.ownership) : null;
    } catch {
      return null;
    }
  }, new Money(0));
  async function decide(action: 'approve' | 'reject') {
    if (lock.current || current.state !== 'submitted') return;
    lock.current = true;
    setBusy(true);
    setFailure('');
    try {
      const body = JSON.stringify(action === 'reject' ? kybRejectionSchema.parse({ reason }) : {});
      if (attempt.current?.action !== action || attempt.current.body !== body)
        attempt.current = { action, body, key: crypto.randomUUID() };
      const response = kybApplicationSchema.parse(
        await api(`/staff/applications/${current.id}/${action}`, {
          method: 'POST',
          body,
          headers: { 'Idempotency-Key': attempt.current.key },
        }),
      );
      setConfirmed({ ...application, ...response });
      await refresh();
    } catch (error) {
      setFailure(errorMessage(error));
      if (error instanceof ApiError && !['internal_error', 'idempotency_in_progress'].includes(error.code))
        attempt.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <aside className={styles.panel} aria-labelledby="application-title">
      <div className={styles.panelHeading}>
        <div>
          <span className="eyebrow">Application</span>
          <State state={current.state} />
        </div>
        <h2 id="application-title">{current.legalName || current.organisation.name}</h2>
        <span>
          <DateTime value={current.submittedAt} />
        </span>
      </div>
      <dl className={styles.details}>
        <div>
          <dt>Legal name</dt>
          <dd>{current.legalName || '—'}</dd>
        </div>
        <div>
          <dt>Registration number</dt>
          <dd className="figure">{current.registrationNumber || '—'}</dd>
        </div>
        <div>
          <dt>Jurisdiction</dt>
          <dd>{current.jurisdiction || '—'}</dd>
        </div>
        <div>
          <dt>Nature of business</dt>
          <dd>{current.natureOfBusiness || '—'}</dd>
        </div>
        <div>
          <dt>Organisation tier</dt>
          <dd>
            {current.organisation.tier} · max{' '}
            <span className="figure">{formatDecimal(current.organisation.maxTradeSize, 0)} CAD</span>
          </dd>
        </div>
        {current.workEmail && (
          <div>
            <dt>Work email</dt>
            <dd>{current.workEmail}</dd>
          </div>
        )}
        {current.monthlyVolume && (
          <div>
            <dt>Monthly volume</dt>
            <dd>{current.monthlyVolume}</dd>
          </div>
        )}
      </dl>
      <section className={styles.owners} aria-label="Beneficial owners">
        <h3 className="eyebrow">Beneficial owners</h3>
        <dl>
          {current.beneficialOwners.map((owner, index) => (
            <div key={index}>
              <dt>{owner.name || 'Unnamed owner'}</dt>
              <dd className="figure">{owner.ownership || '—'}%</dd>
            </div>
          ))}
          <div className={total?.eq(100) ? styles.validTotal : undefined}>
            <dt>Total</dt>
            <dd className="figure">
              {total?.toFixed() ?? 'Incomplete'}
              {total && '%'}
            </dd>
          </div>
        </dl>
      </section>
      <div className={styles.actions}>
        {failure && (
          <p role="alert" className={styles.failure}>
            {failure}
          </p>
        )}
        {current.state === 'submitted' ? (
          rejecting ? (
            <>
              <label htmlFor="rejection-reason">Reason for rejection</label>
              <textarea
                id="rejection-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={busy}
                aria-describedby="reason-hint"
              />
              <p id="reason-hint">Required. The client sees this reason on their Onboarding page.</p>
              <div>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => setRejecting(false)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="button-danger"
                  disabled={busy || !kybRejectionSchema.safeParse({ reason }).success}
                  onClick={() => {
                    void decide('reject');
                  }}
                >
                  {busy ? 'Rejecting…' : 'Confirm rejection'}
                </button>
              </div>
            </>
          ) : (
            <div>
              <button
                type="button"
                className="button-primary"
                disabled={busy}
                onClick={() => {
                  void decide('approve');
                }}
              >
                {busy ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                className="button-danger"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                Reject
              </button>
            </div>
          )
        ) : (
          <p role="status">
            {current.state === 'draft' ? (
              'This application is still a draft. The client must submit it before review.'
            ) : (
              <>
                {label(current.state)} by{' '}
                {current.decisionBy === persona?.user.id ? persona.user.name : current.decisionBy} on{' '}
                <DateTime value={current.decidedAt} />.{' '}
                {current.state === 'approved'
                  ? 'The client can now request firm quotes.'
                  : `Reason shared with the client: ${current.decisionReason}`}
              </>
            )}
          </p>
        )}
      </div>
    </aside>
  );
}
function Applications() {
  const resource = useResource('/staff/applications', parser);
  const [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const all = resource.data ?? [],
    needs = all.filter((application) => application.state === 'submitted');
  const rows = filter === 'needs' ? needs : all;
  const current = all.find((application) => application.id === selected) ?? needs[0] ?? all[0];
  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Approvals</h1>
          <p>Business verification (KYB) applications</p>
        </div>
        <FilterPills
          label="Filter applications"
          value={filter}
          onChange={(value) => {
            if (!busy) setFilter(value);
          }}
          options={[
            { value: 'needs', label: 'Needs review', count: needs.length },
            { value: 'all', label: 'All', count: all.length },
          ]}
        />
      </div>
      <ResourceFailure error={resource.error} retry={resource.refresh} />
      <div className={styles.layout}>
        <section className={styles.list}>
          <DataTable
            dense
            label="KYB applications"
            rows={rows}
            rowKey={(application) => application.id}
            loading={resource.loading}
            empty={
              <EmptyState
                message={
                  resource.error
                    ? 'Applications are unavailable.'
                    : filter === 'needs'
                      ? 'No applications need review.'
                      : 'No applications yet.'
                }
              />
            }
            columns={[
              {
                key: 'organisation',
                heading: 'Organisation',
                render: (application) => (
                  <span className={application.id === current?.id ? styles.selected : undefined}>
                    {application.organisation.name}
                  </span>
                ),
              },
              {
                key: 'jurisdiction',
                heading: 'Jurisdiction',
                render: (application) => application.jurisdiction || '—',
              },
              {
                key: 'submitted',
                heading: 'Submitted',
                mono: true,
                render: (application) => <DateTime value={application.submittedAt} />,
              },
              {
                key: 'owners',
                heading: 'Owners',
                mono: true,
                render: (application) => application.beneficialOwners.length,
              },
              {
                key: 'status',
                heading: 'Status',
                render: (application) => <State state={application.state} />,
              },
              {
                key: 'open',
                heading: 'Open',
                render: (application) => (
                  <button
                    type="button"
                    className={styles.open}
                    aria-label={`Open application from ${application.organisation.name}`}
                    aria-pressed={current?.id === application.id}
                    disabled={busy}
                    onClick={() => setSelected(application.id)}
                  >
                    Open
                  </button>
                ),
              },
            ]}
          />
        </section>
        {current && (
          <ApplicationPanel
            key={current.id}
            application={current}
            refresh={resource.refreshAfterWrite}
            busy={busy}
            setBusy={setBusy}
          />
        )}
      </div>
    </>
  );
}
export default function ApprovalsPage() {
  const { persona, loading, openPersonas } = useSession();
  return (
    <div className={styles.background}>
      <main className={styles.page}>
        {loading ? (
          <>
            <h1>Approvals</h1>
            <DataTable
              label="Loading applications"
              rows={[]}
              columns={[{ key: 'application', heading: 'Application', render: () => null }]}
              rowKey={() => ''}
              loading
            />
          </>
        ) : persona?.user.role === 'staff' ? (
          <Applications />
        ) : (
          <>
            <h1>Approvals</h1>
            <EmptyState message="Choose the staff persona to review applications." />
            <button type="button" className="button-primary" onClick={openPersonas}>
              Choose persona
            </button>
          </>
        )}
      </main>
    </div>
  );
}
