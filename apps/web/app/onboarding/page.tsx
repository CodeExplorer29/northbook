'use client';

import {
  kybApplicationSchema,
  kybSubmissionSchema,
  monthlyVolumeSchema,
  type KybApplication,
  type KybDraft,
  type Session,
} from '@northbook/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../../components/demo-session';
import { DataTable } from '../../components/data-display';
import { EmptyState, ResourceFailure } from '../../components/feedback';
import { api, ApiError } from '../../lib/api';
import { formatDecimal } from '../../lib/format-money';
import { ownershipTotal, verificationTime } from '../../lib/kyb-presentation';
import { useResource } from '../../lib/use-resource';
import styles from './onboarding.module.css';

const draftFields = (application: KybApplication): KybDraft => ({
  legalName: application.legalName,
  registrationNumber: application.registrationNumber,
  jurisdiction: application.jurisdiction,
  natureOfBusiness: application.natureOfBusiness,
  beneficialOwners: application.beneficialOwners,
  workEmail: application.workEmail,
  monthlyVolume: application.monthlyVolume,
});
const fieldLabels = {
  legalName: 'Legal name',
  registrationNumber: 'Registration number',
  jurisdiction: 'Jurisdiction',
  natureOfBusiness: 'Nature of business',
} as const;
const jurisdictions = [
  'Alberta, Canada',
  'British Columbia, Canada',
  'Ontario, Canada',
  'Quebec, Canada',
  'Other',
];
const fieldId = (path: readonly PropertyKey[]) => `kyb-${path.join('-')}`;

function DraftForm({
  application,
  onSubmitted,
}: {
  application: KybApplication;
  onSubmitted: () => Promise<void>;
}) {
  const [fields, setFields] = useState(() => draftFields(application));
  const [saved, setSaved] = useState(() => JSON.stringify(draftFields(application)));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const latestSaved = useRef(saved);
  const queue = useRef(Promise.resolve());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const lock = useRef(false);
  const sealed = useRef(false);
  const submitKey = useRef<string | null>(null);
  const errorsRef = useRef<HTMLDivElement>(null);
  const save = useCallback((value: KybDraft) => {
    const json = JSON.stringify(value);
    const work = queue.current
      .catch(() => {})
      .then(async () => {
        if (!mounted.current || sealed.current || latestSaved.current === json) return;
        setSaving(true);
        try {
          kybApplicationSchema.parse(await api('/kyb/application', { method: 'PUT', body: json }));
          latestSaved.current = json;
          setSaved(json);
          setFailure(null);
        } finally {
          setSaving(false);
        }
      });
    queue.current = work;
    return work;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!lock.current) void save(fields).catch(setFailure);
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  }, [fields, save]);
  const validation = kybSubmissionSchema.safeParse(fields);
  const issues = showErrors && !validation.success ? validation.error.issues : [];
  const fieldIssues = (path: string) => issues.filter((issue) => issue.path.join('.') === path);
  const inlineErrors = (path: string) =>
    fieldIssues(path).length > 0 && (
      <span id={`${fieldId(path.split('.'))}-error`} className={styles.fieldError}>
        {fieldIssues(path)
          .map((issue) => issue.message)
          .join(' ')}
      </span>
    );
  const field = (name: keyof typeof fieldLabels) => {
    const id = fieldId([name]);
    const invalid = fieldIssues(name).length > 0;
    const common = {
      id,
      value: fields[name],
      disabled: submitting,
      'aria-invalid': invalid,
      'aria-describedby': `${id}-hint${invalid ? ` ${id}-error` : ''}`,
      onChange: (event: { target: { value: string } }) => {
        setFields({ ...fields, [name]: event.target.value });
      },
    };
    return (
      <div className={styles.field}>
        <label htmlFor={id}>{fieldLabels[name]}</label>
        {name === 'jurisdiction' ? (
          <select {...common}>
            <option value="">Choose a jurisdiction</option>
            {[
              ...jurisdictions,
              ...(fields.jurisdiction && !jurisdictions.includes(fields.jurisdiction)
                ? [fields.jurisdiction]
                : []),
            ].map((jurisdiction) => (
              <option key={jurisdiction}>{jurisdiction}</option>
            ))}
          </select>
        ) : name === 'natureOfBusiness' ? (
          <textarea {...common} maxLength={2000} />
        ) : (
          <input
            {...common}
            className={name === 'registrationNumber' ? 'figure' : ''}
            maxLength={name === 'registrationNumber' ? 100 : 200}
          />
        )}
        <span id={`${id}-hint`} className={styles.hint}>
          {name === 'registrationNumber' ? 'As shown on your certificate of incorporation' : ''}
        </span>
        {inlineErrors(name)}
      </div>
    );
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setShowErrors(true);
    if (!validation.success) {
      requestAnimationFrame(() => {
        errorsRef.current?.focus();
      });
      return;
    }
    lock.current = true;
    setSubmitting(true);
    setFailure(null);
    try {
      await save(fields);
      if (!mounted.current) return;
      submitKey.current ??= crypto.randomUUID();
      const result = kybApplicationSchema.parse(
        await api('/kyb/application/submit', {
          method: 'POST',
          body: '{}',
          headers: { 'idempotency-key': submitKey.current },
        }),
      );
      sealed.current = result.state !== 'draft';
      await onSubmitted();
    } catch (error) {
      if (error instanceof ApiError && !['internal_error', 'idempotency_in_progress'].includes(error.code))
        submitKey.current = null;
      setFailure(error);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  const total = ownershipTotal(fields.beneficialOwners);
  return (
    <>
      {issues.length > 0 && (
        <div ref={errorsRef} className={styles.errorSummary} role="alert" tabIndex={-1}>
          <strong>Fix {issues.length} problems before submitting</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>
                <a href={`#${fieldId(issue.path)}`}>{issue.message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {failure !== null && (
        <ResourceFailure
          error={failure}
          retry={async () => {
            await save(fields);
            await onSubmitted();
          }}
        />
      )}
      <form
        className={styles.form}
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
      >
        <fieldset disabled={submitting}>
          <legend>Business</legend>
          {field('legalName')}
          <div className={styles.twoFields}>
            {field('registrationNumber')}
            {field('jurisdiction')}
          </div>
          {field('natureOfBusiness')}
          <div className={styles.twoFields}>
            <div className={styles.field}>
              <label htmlFor="kyb-workEmail">Work email (optional)</label>
              <input
                id="kyb-workEmail"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={fields.workEmail ?? ''}
                aria-invalid={fieldIssues('workEmail').length > 0}
                aria-describedby={fieldIssues('workEmail').length ? 'kyb-workEmail-error' : undefined}
                onChange={(event) => {
                  setFields({ ...fields, workEmail: event.target.value });
                }}
              />
              {inlineErrors('workEmail')}
            </div>
            <div className={styles.field}>
              <label htmlFor="kyb-monthlyVolume">Expected monthly volume (optional)</label>
              <select
                id="kyb-monthlyVolume"
                value={fields.monthlyVolume ?? ''}
                onChange={(event) => {
                  setFields({ ...fields, monthlyVolume: monthlyVolumeSchema.parse(event.target.value) });
                }}
              >
                {monthlyVolumeSchema.options.map((volume) => (
                  <option key={volume} value={volume}>
                    {volume || 'Not provided'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset id="kyb-beneficialOwners" disabled={submitting} tabIndex={-1}>
          <legend>Beneficial owners</legend>
          <p className={styles.hint}>
            Everyone who owns 25% or more, directly or indirectly. Ownership should add up to the full
            business.
          </p>
          {fields.beneficialOwners.map((owner, index) => (
            <div className={styles.ownerRow} key={index}>
              {(['name', 'ownership'] as const).map((key) => {
                const path = `beneficialOwners.${index}.${key}`;
                const id = fieldId(path.split('.'));
                return (
                  <div className={styles.field} key={key}>
                    <label htmlFor={id}>{key === 'name' ? 'Full name' : 'Ownership'}</label>
                    <div className={key === 'ownership' ? styles.percentInput : ''}>
                      <input
                        id={id}
                        className={key === 'ownership' ? 'figure' : ''}
                        inputMode={key === 'ownership' ? 'decimal' : 'text'}
                        maxLength={key === 'ownership' ? 32 : 200}
                        value={owner[key]}
                        aria-invalid={fieldIssues(path).length > 0}
                        aria-describedby={fieldIssues(path).length ? `${id}-error` : undefined}
                        onChange={(event) => {
                          setFields({
                            ...fields,
                            beneficialOwners: fields.beneficialOwners.map((item, row) =>
                              row === index ? { ...item, [key]: event.target.value } : item,
                            ),
                          });
                        }}
                      />
                      {key === 'ownership' && <span aria-hidden="true">%</span>}
                    </div>
                    {inlineErrors(path)}
                  </div>
                );
              })}
              <button
                className={styles.removeOwner}
                type="button"
                aria-label={`Remove owner ${index + 1}`}
                onClick={() => {
                  setFields({
                    ...fields,
                    beneficialOwners: fields.beneficialOwners.filter((_, row) => row !== index),
                  });
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
                </svg>
              </button>
            </div>
          ))}
          {inlineErrors('beneficialOwners')}
          <div className={styles.ownerFooter}>
            <button
              type="button"
              className="button-secondary"
              disabled={submitting || fields.beneficialOwners.length >= 20}
              onClick={() => {
                setFields({
                  ...fields,
                  beneficialOwners: [...fields.beneficialOwners, { name: '', ownership: '' }],
                });
              }}
            >
              ＋ Add owner
            </button>
            <span className={total === '100' ? styles.totalComplete : styles.totalIncomplete}>
              Total <strong className="figure">{total}%</strong>
            </span>
          </div>
        </fieldset>
        <div className={styles.submitRow}>
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
          <span className={styles.hint}>
            <span role="status">
              {saving
                ? 'Saving draft…'
                : saved === JSON.stringify(fields)
                  ? 'Draft saved automatically.'
                  : 'Unsaved changes.'}
            </span>{' '}
            Identity checks in this demonstration are simulated.
          </span>
        </div>
      </form>
    </>
  );
}

function Application({ organisation }: { organisation: NonNullable<Session['organisation']> }) {
  const { verificationHandoff } = useSession();
  const resource = useResource('/kyb/application', kybApplicationSchema);
  const application = resource.data;
  const state = application?.state ?? organisation.kybState;
  const index = state === 'draft' ? 0 : state === 'submitted' ? 1 : 2;
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <span className="eyebrow">{organisation.name}</span>
        <h1>Business verification</h1>
        <p>
          We verify every business before it can request firm quotes. Tell us who you are and who owns the
          business.
        </p>
      </div>
      <ol className={styles.progress} aria-label="Verification progress">
        {['Details', 'Review', state === 'rejected' ? 'Not approved' : 'Verified'].map((label, step) => {
          const done = step < index || state === 'approved';
          const current = step === index && state !== 'approved';
          return (
            <li
              key={step}
              className={
                step === 2 && state === 'rejected'
                  ? styles.rejectedStep
                  : done
                    ? styles.doneStep
                    : current
                      ? styles.currentStep
                      : ''
              }
              aria-current={current ? 'step' : undefined}
            >
              <span className={styles.progressBar} />
              <span className={styles.progressLabel}>
                <span>{label}</span>
                <small>{done ? 'Done' : current && state !== 'rejected' ? 'Current' : ''}</small>
              </span>
            </li>
          );
        })}
      </ol>
      {resource.error !== null && <ResourceFailure error={resource.error} retry={resource.refresh} />}
      {organisation.id === 'cedar' && verificationHandoff && (
        <section className={`${styles.statusPanel} ${styles.review}`} aria-label="Details from Home">
          <div>
            <h2>Details from Home</h2>
            <p role="status">{verificationHandoff.message}</p>
            <dl>
              {Object.entries(verificationHandoff.fields)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div className={styles.keyValue} key={key}>
                    <dt>
                      {key === 'legalName'
                        ? 'Legal name'
                        : key === 'workEmail'
                          ? 'Work email'
                          : 'Expected monthly volume'}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </section>
      )}
      {resource.loading && (
        <DataTable
          label="Loading application"
          rows={[]}
          columns={[{ key: 'field', heading: 'Business details', render: () => null }]}
          rowKey={() => ''}
          loading
        />
      )}
      {application && (
        <>
          {state === 'submitted' && (
            <div className={`${styles.statusPanel} ${styles.review}`} role="status">
              <span className={styles.statusIcon} aria-hidden="true">
                ◷
              </span>
              <div>
                <h2>Under review. No action is needed from you.</h2>
                <p>
                  Submitted{' '}
                  <time className="figure" dateTime={application.submittedAt!}>
                    {verificationTime(application.submittedAt!)}
                  </time>
                  . This page updates when our team makes a decision.
                </p>
              </div>
            </div>
          )}
          {state === 'approved' && (
            <div className={`${styles.statusPanel} ${styles.approved}`} role="status">
              <span className={styles.statusIcon} aria-hidden="true">
                ✓
              </span>
              <div>
                <h2>Verified. You can request firm quotes.</h2>
                <p>
                  {/^tier /i.test(organisation.tier) ? organisation.tier : `Tier ${organisation.tier}`} ·
                  Maximum trade{' '}
                  <span className="figure">{formatDecimal(organisation.maxTradeSize, 0)} CAD</span>
                </p>
              </div>
              <Link className="button-primary" href="/trade">
                Go to Trade
              </Link>
            </div>
          )}
          {state === 'rejected' && (
            <div className={`${styles.statusPanel} ${styles.rejected}`} role="status">
              <span className={styles.statusIcon} aria-hidden="true">
                ×
              </span>
              <div>
                <h2>Not approved</h2>
                <p className={styles.reason}>Reason: {application.decisionReason}</p>
                <p>
                  Reviewed{' '}
                  <time className="figure" dateTime={application.decidedAt!}>
                    {verificationTime(application.decidedAt!)}
                  </time>{' '}
                  by Northbook operations.
                </p>
              </div>
            </div>
          )}
          {state === 'draft' ? (
            <DraftForm
              key={application.id}
              application={application}
              onSubmitted={resource.refreshAfterWrite}
            />
          ) : (
            <section className={styles.readOnly} aria-label="Application summary">
              <div>
                <h2>Business</h2>
                <dl>
                  {(Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]).map((name) => (
                    <div className={styles.keyValue} key={name}>
                      <dt>{fieldLabels[name]}</dt>
                      <dd className={name === 'registrationNumber' ? 'figure' : ''}>{application[name]}</dd>
                    </div>
                  ))}
                  {application.workEmail && (
                    <div className={styles.keyValue}>
                      <dt>Work email</dt>
                      <dd>{application.workEmail}</dd>
                    </div>
                  )}
                  {application.monthlyVolume && (
                    <div className={styles.keyValue}>
                      <dt>Expected monthly volume</dt>
                      <dd>{application.monthlyVolume}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div>
                <h2>Beneficial owners</h2>
                <dl>
                  {application.beneficialOwners.map((owner, index) => (
                    <div className={styles.keyValue} key={index}>
                      <dt>{owner.name}</dt>
                      <dd className={`figure ${styles.ownerPercent}`}>{owner.ownership}%</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function OnboardingPage() {
  const { persona, loading, openPersonas } = useSession();
  if (loading)
    return (
      <main className={styles.page}>
        <h1>Business verification</h1>
        <DataTable
          label="Loading account"
          rows={[]}
          columns={[{ key: 'account', heading: 'Account', render: () => null }]}
          rowKey={() => ''}
          loading
        />
      </main>
    );
  if (persona?.user.role !== 'client' || !persona.organisation)
    return (
      <main className={styles.page}>
        <h1>Business verification</h1>
        <EmptyState message="Choose a client persona to view its application." />
        <button className="button-primary" onClick={openPersonas}>
          Choose persona
        </button>
      </main>
    );
  return <Application organisation={persona.organisation} />;
}
