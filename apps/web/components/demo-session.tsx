'use client';

import {
  demoStatusSchema,
  homeVerificationSchema,
  kybApplicationSchema,
  personaIdSchema,
  sessionSchema,
  type DemoStatus,
  type HomeVerification,
  type Session,
} from '@northbook/shared';
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, errorMessage } from '../lib/api';
import { AppHeader, DemoNotice, Footer, type PersonaMenuHandle } from './app-chrome';
import { EmptyState, ResourceFailure } from './feedback';
import styles from './demo-session.module.css';

type VerificationHandoff = { fields: HomeVerification; message: string };
const SessionContext = createContext<{
  persona: Session | null;
  loading: boolean;
  openPersonas: () => void;
  startVerification: (fields: HomeVerification) => Promise<boolean>;
  verificationHandoff: VerificationHandoff | null;
}>({
  persona: null,
  loading: true,
  openPersonas() {},
  async startVerification() {
    return false;
  },
  verificationHandoff: null,
});
export const useSession = () => useContext(SessionContext);

export function DemoSession({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Session | null>(null);
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retryAction = useRef<() => Promise<boolean>>(async () => false);
  const [connectionError, setConnectionError] = useState<unknown>(null);
  const generation = useRef({ value: 0 });
  const retryAfter = useRef(0);
  const [verificationHandoff, setVerificationHandoff] = useState<VerificationHandoff | null>(null);
  const lock = useRef(false);
  const menuRef = useRef<PersonaMenuHandle>(null);
  const router = useRouter();
  const pathname = usePathname();
  const home = pathname === '/';
  const variant = home ? 'dark' : persona?.user.role === 'staff' ? 'staff' : 'light';
  const refreshSession = useCallback(async () => {
    if (lock.current || Date.now() < retryAfter.current) return;
    const version = generation.current.value;
    try {
      const [identity, data] = await Promise.all([api('/me'), api('/demo/status')]);
      const updated = demoStatusSchema.parse(data);
      const next =
        identity && typeof identity === 'object' && 'user' in identity && identity.user !== null
          ? sessionSchema.parse(identity)
          : null;
      if (version !== generation.current.value) return;
      setStatus(updated);
      setPersona(next);
      setConnectionError(null);
      retryAfter.current = 0;
    } catch (failure) {
      if (version !== generation.current.value) return;
      retryAfter.current =
        failure instanceof ApiError && failure.code === 'rate_limited'
          ? (failure.retryAt ?? Date.now() + 5000)
          : 0;
      setConnectionError(failure);
      throw failure;
    } finally {
      if (version === generation.current.value) setLoading(false);
    }
  }, []);
  const refreshStatus = useCallback(() => {
    void refreshSession().catch(() => {});
  }, [refreshSession]);
  useEffect(() => {
    const lifecycle = generation.current;
    void Promise.resolve().then(refreshStatus);
    const timer = setInterval(refreshStatus, 5000);
    return () => {
      lifecycle.value++;
      clearInterval(timer);
    };
  }, [refreshStatus]);
  async function choose(value: string, intake?: HomeVerification) {
    if (lock.current) return false;
    retryAction.current = () => choose(value, intake);
    lock.current = true;
    generation.current.value++;
    setChanging(true);
    setError(null);
    try {
      const userId = personaIdSchema.parse(value);
      const data = await api('/demo/persona', { method: 'POST', body: JSON.stringify({ userId }) });
      const next = userId === 'visitor' ? null : sessionSchema.parse(data);
      setVerificationHandoff(null);
      if (intake) {
        // Select the existing Cedar persona, then update only its draft. Never
        // create identities, replace a submitted application or change its tier.
        try {
          const application = kybApplicationSchema.parse(await api('/kyb/application'));
          if (application.state === 'draft') {
            kybApplicationSchema.parse(
              await api('/kyb/application', {
                method: 'PUT',
                body: JSON.stringify({
                  legalName: intake.legalName || application.legalName,
                  registrationNumber: application.registrationNumber,
                  jurisdiction: application.jurisdiction,
                  natureOfBusiness: application.natureOfBusiness,
                  beneficialOwners: application.beneficialOwners,
                  workEmail: intake.workEmail || application.workEmail,
                  monthlyVolume: intake.monthlyVolume || application.monthlyVolume,
                }),
              }),
            );
          } else
            setVerificationHandoff({
              fields: intake,
              message: 'This application has already been submitted. Your new details have not replaced it.',
            });
        } catch (failure) {
          setVerificationHandoff({
            fields: intake,
            message: `We could not confirm that your details were saved. Review the application below. ${errorMessage(failure)}`,
          });
        }
      }
      setPersona(next);
      setConnectionError(null);
      router.replace(
        intake ? '/onboarding' : next?.user.role === 'staff' ? '/staff/blotter' : next ? '/trade' : '/',
      );
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure);
      return false;
    } finally {
      lock.current = false;
      setChanging(false);
      refreshStatus();
    }
  }
  const chrome = (
    <>
      <AppHeader
        variant={variant}
        persona={persona}
        status={status}
        busy={loading || changing}
        error=""
        onOpen={refreshStatus}
        onChoose={choose}
        menuRef={menuRef}
      />
      <DemoNotice variant={variant} />
      {error !== null && (
        <section className={styles.feedback} aria-label="Action status">
          <ResourceFailure
            error={error}
            retry={async () => {
              await retryAction.current();
            }}
          />
        </section>
      )}
      {connectionError !== null && (
        <section className={styles.feedback} aria-label="Connection status">
          <ResourceFailure error={connectionError} retry={refreshSession} />
        </section>
      )}
      {status?.personas.length === 0 && (
        <section className={styles.feedback} aria-label="Demo data">
          <EmptyState
            message="No demo accounts are available."
            action={{ label: 'Read about the demo', href: '/architecture' }}
          />
        </section>
      )}
    </>
  );
  const content = (
    <div className={styles.content}>
      <Fragment key={home ? 'home' : (persona?.user.id ?? 'visitor')}>{children}</Fragment>
    </div>
  );
  return (
    <SessionContext.Provider
      value={{
        persona,
        loading,
        verificationHandoff,
        startVerification: (fields) => choose('cedar-admin', homeVerificationSchema.parse(fields)),
        openPersonas: () => {
          menuRef.current?.open();
        },
      }}
    >
      <div className={styles.shell}>
        {home ? (
          <div className={`band-dark ${styles.top}`}>
            {chrome}
            {content}
          </div>
        ) : (
          <>
            {chrome}
            {content}
          </>
        )}
        <Footer expanded={home} />
      </div>
    </SessionContext.Provider>
  );
}
