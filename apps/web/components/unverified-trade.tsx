'use client';

import {
  kybApplicationSchema,
  kybSubmissionSchema,
  type QuoteRequest,
  type Session,
} from '@northbook/shared';
import Link from 'next/link';
import { useState } from 'react';
import { kybLabels, ownershipTotal } from '../lib/kyb-presentation';
import { useIndicativePrice } from '../lib/use-indicative-price';
import { useResource } from '../lib/use-resource';
import { DataTable, StatusChip } from './data-display';
import { ResourceFailure } from './feedback';
import { SwapWidget } from './swap-widget';
import styles from '../app/trade/trade.module.css';

export function UnverifiedTrade({ organisation }: { organisation: NonNullable<Session['organisation']> }) {
  const [value, setValue] = useState<QuoteRequest>({
    pair: 'ETH/CAD',
    side: 'SELL',
    fixed: 'base',
    amount: '50',
  });
  const {
    price,
    minimumCad,
    error: priceError,
    retry: retryPrice,
  } = useIndicativePrice(value.pair, value.side);
  const application = useResource('/kyb/application', kybApplicationSchema);
  const state = application.data?.state ?? organisation.kybState;
  const validation = application.data
    ? kybSubmissionSchema.safeParse({
        legalName: application.data.legalName,
        registrationNumber: application.data.registrationNumber,
        jurisdiction: application.data.jurisdiction,
        natureOfBusiness: application.data.natureOfBusiness,
        beneficialOwners: application.data.beneficialOwners,
      })
    : null;
  const issues = validation?.success === false ? validation.error.issues : [];
  const businessComplete = !!validation && !issues.some((issue) => issue.path[0] !== 'beneficialOwners');
  const ownersComplete = !!validation && !issues.some((issue) => issue.path[0] === 'beneficialOwners');
  const steps = [
    { label: 'Business details', done: businessComplete, note: businessComplete ? 'Complete' : 'Incomplete' },
    {
      label: 'Beneficial owners',
      done: ownersComplete,
      note:
        ownersComplete && application.data
          ? `${application.data.beneficialOwners.length} owners · ${ownershipTotal(application.data.beneficialOwners)}%`
          : 'Incomplete',
    },
    {
      label: state === 'draft' ? 'Submit for review' : 'Staff review',
      done: state === 'approved',
      note: state === 'draft' ? 'Your next step' : kybLabels[state],
    },
  ];
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">
            {organisation.name} · {organisation.tier}
          </span>
          <h1>Trade</h1>
        </div>
      </div>
      <ResourceFailure error={priceError} retry={retryPrice} />
      <div className={styles.grid}>
        <SwapWidget
          mode="indicative"
          value={value}
          onChange={setValue}
          price={price}
          minimumCad={minimumCad}
          onAction={() => {}}
          actionDisabled
        />
        <aside className={styles.activity}>
          <section className={styles.verification} aria-labelledby="verification-title">
            <div className={styles.verificationHeading}>
              <span className="eyebrow">Onboarding</span>
              <StatusChip
                tone={state === 'rejected' ? 'danger' : state === 'approved' ? 'positive' : 'neutral'}
              >
                {kybLabels[state]}
              </StatusChip>
            </div>
            <div>
              <h2 id="verification-title">
                {state === 'submitted'
                  ? 'Your application is under review'
                  : state === 'rejected'
                    ? 'Your application was not approved'
                    : state === 'approved'
                      ? 'Your business is verified'
                      : 'Your business is not verified yet'}
              </h2>
              <p>
                {state === 'submitted'
                  ? 'No action is needed from you. This page updates when our team makes a decision.'
                  : state === 'rejected'
                    ? application.data?.decisionReason
                    : 'You can see indicative prices now. Firm quotes unlock once our team approves your application.'}
              </p>
            </div>
            {application.error !== null && (
              <ResourceFailure error={application.error} retry={application.refresh} />
            )}
            {application.loading ? (
              <DataTable
                label="Loading verification"
                rows={[]}
                columns={[{ key: 'stage', heading: 'Stage', render: () => null }]}
                rowKey={() => ''}
                loading
              />
            ) : (
              application.data && (
                <ol className={styles.checklist}>
                  {steps.map((step) => (
                    <li key={step.label}>
                      <span className={step.done ? styles.checkDone : styles.checkPending} aria-hidden="true">
                        {step.done ? '✓' : ''}
                      </span>
                      <span>{step.label}</span>
                      <small>{step.note}</small>
                    </li>
                  ))}
                </ol>
              )
            )}
            <p className={styles.verificationNote}>
              After you submit, review is done by Northbook operations. You will see the decision on the
              Onboarding page.
            </p>
            <Link className="button-primary" href="/onboarding">
              {state === 'draft' ? 'Continue onboarding' : 'View application'}
            </Link>
          </section>
          <section className={`${styles.panel} ${styles.unverifiedRecent}`}>
            <div className={styles.panelHeading}>
              <h2>Recent quotes</h2>
            </div>
            <p>No quotes yet. Firm quotes are available after verification.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
