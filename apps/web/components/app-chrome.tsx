'use client';

import type { DemoStatus, Session } from '@northbook/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import styles from './app-chrome.module.css';
import { StatusChip } from './data-display';

type Variant = 'light' | 'dark' | 'staff';
export function Brand({ dark = false, staff = false }: { dark?: boolean; staff?: boolean }) {
  return (
    <Link href="/" className={`${styles.brand} ${dark ? styles.brandDark : ''}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="7" />
        <path
          d="M8 18V8l10 10V8"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Northbook</span>
      {staff && <span className={styles.staffTag}>Staff</span>}
    </Link>
  );
}
function Verification({ session, tier = false }: { session: Session; tier?: boolean }) {
  if (!session.organisation) return null;
  const org = session.organisation;
  return (
    <StatusChip
      dense
      tone={org.kybState === 'approved' ? 'positive' : org.kybState === 'rejected' ? 'danger' : 'neutral'}
    >
      {org.kybState === 'approved'
        ? `Verified${tier ? ` · ${org.tier}` : ''}`
        : org.kybState === 'submitted'
          ? 'In review'
          : org.kybState === 'rejected'
            ? 'Rejected'
            : 'Not verified'}
    </StatusChip>
  );
}

export type PersonaMenuHandle = { open: () => void };
type SwitcherProps = {
  persona: Session | null;
  status: DemoStatus | null;
  busy: boolean;
  error: string;
  onOpen: () => void;
  onChoose: (id: string) => Promise<boolean>;
  menuRef?: Ref<PersonaMenuHandle>;
};
export function PersonaSwitcher({ persona, status, busy, error, onOpen, onChoose, menuRef }: SwitcherProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useImperativeHandle(
    menuRef,
    () => ({
      open() {
        onOpen();
        setOpen(true);
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
    }),
    [onOpen],
  );
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  async function select(id: string) {
    if (await onChoose(id)) close();
  }
  const name = persona?.organisation?.name ?? persona?.user.name ?? 'Visitor';
  const initials =
    persona?.organisation?.id === 'maple'
      ? 'MR'
      : persona?.organisation?.id === 'harbourline'
        ? 'HT'
        : persona?.organisation?.id === 'cedar'
          ? 'CF'
          : persona
            ? 'DO'
            : null;
  return (
    <div ref={root} className={styles.switcher} onKeyDown={keyboard}>
      <button
        ref={trigger}
        type="button"
        className={styles.personaButton}
        aria-label={`Switch persona: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={busy}
        onClick={() => {
          if (!open) onOpen();
          setOpen(!open);
        }}
      >
        <span className={styles.avatar}>
          {initials ?? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          )}
        </span>
        <span className={styles.personaName}>{busy ? 'Switching…' : name}</span>
        <span className={styles.personaMeta}>
          {persona?.organisation ? (
            <Verification session={persona} />
          ) : persona ? (
            '· Operations'
          ) : (
            '· Not signed in'
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          className={styles.menu}
          role="menu"
          aria-label="Choose a demo persona"
          aria-busy={busy}
        >
          <div className={styles.menuHeading}>
            <span className="eyebrow">Choose a demo persona</span>
            <button type="button" onClick={close} role="menuitem">
              Close
            </button>
          </div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!persona}
            className={styles.menuItem}
            disabled={busy}
            onClick={() => {
              void select('visitor');
            }}
          >
            <span>
              <strong>Visitor</strong>
              <small>Not signed in</small>
            </span>
            {!persona && <span aria-label="Current persona">✓</span>}
          </button>
          {status?.personas.map((entry) => (
            <button
              type="button"
              role="menuitemradio"
              key={entry.user.id}
              aria-checked={entry.user.id === persona?.user.id}
              className={styles.menuItem}
              disabled={busy}
              onClick={() => {
                void select(entry.user.id);
              }}
            >
              <span>
                <strong>{entry.organisation?.name ?? 'Northbook staff'}</strong>
                <small>
                  {entry.user.name}
                  {entry.user.role === 'staff'
                    ? ' · Operations'
                    : entry.user.id === 'cedar-admin'
                      ? ', Admin'
                      : ', Trader'}
                </small>
              </span>
              {entry.organisation ? <Verification session={entry} tier /> : <span aria-hidden="true">→</span>}
            </button>
          ))}
          {!status && !error && <p className={styles.menuNote}>Loading personas…</p>}
          {error && (
            <p className={styles.menuError} role="alert">
              {error}
            </p>
          )}
          <div className={styles.menuNote}>
            <p>{status?.sharedNotice ?? 'Demo data is shared between viewers.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppHeader({ variant, ...props }: SwitcherProps & { variant: Variant }) {
  const pathname = usePathname();
  const links =
    props.persona?.user.role === 'staff'
      ? [
          ['Approvals', '/staff/approvals'],
          ['Blotter', '/staff/blotter'],
          ['Desk', '/staff/desk'],
          ['Configuration', '/staff/configuration'],
          ['Architecture', '/architecture'],
        ]
      : props.persona
        ? [
            ['Trade', '/trade'],
            ['Quotes', '/quotes'],
            ['Trades', '/trades'],
            ['Onboarding', '/onboarding'],
            ['Architecture', '/architecture'],
          ]
        : [
            ['Home', '/'],
            ['Architecture', '/architecture'],
          ];
  return (
    <header className={`${styles.header} ${styles[variant]}`} data-variant={variant}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <Brand dark={variant === 'dark'} staff={variant === 'staff'} />
          <nav
            className={styles.navigation}
            aria-label={props.persona?.user.role === 'staff' ? 'Staff' : 'Main'}
          >
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href!}
                aria-current={
                  pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)) ? 'page' : undefined
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <PersonaSwitcher {...props} />
      </div>
      <details className={styles.mobileNavigation}>
        <summary>Navigation</summary>
        <nav aria-label="Mobile">
          {links.map(([label, href]) => (
            <Link key={href} href={href!}>
              {label}
            </Link>
          ))}
        </nav>
      </details>
      {props.error && (
        <p className={styles.headerError} role="alert">
          {props.error}
        </p>
      )}
    </header>
  );
}
export function DemoNotice({ variant }: { variant: Variant }) {
  return (
    <aside aria-label="Demo notice" className={`${styles.notice} ${styles[variant]}`}>
      <div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.5" />
        </svg>
        <span>Demonstration only. No real funds move. Identity and settlement are simulated.</span>
      </div>
    </aside>
  );
}
export function Footer({ expanded }: { expanded: boolean }) {
  return (
    <footer className={`${styles.footer} ${expanded ? styles.expanded : styles.compact}`}>
      <div className={styles.footerInner}>
        {expanded && (
          <div className={styles.footerTop}>
            <div className={styles.footerBrand}>
              <Brand dark />
              <p>Firm quotes. No last look.</p>
            </div>
            <div className={styles.footerColumns}>
              <div>
                <h2 className="eyebrow">Product</h2>
                <Link href="/trade">Trade</Link>
                <Link href="/quotes">Quotes</Link>
                <Link href="/trades">Trades</Link>
                <Link href="/onboarding">Onboarding</Link>
              </div>
              <div>
                <h2 className="eyebrow">Learn</h2>
                <Link href="/architecture">Architecture</Link>
                <Link href="/#how">How it works</Link>
                <a href="https://github.com/CodeExplorer29/northbook" target="_blank" rel="noreferrer">
                  Source repository
                </a>
              </div>
              <div>
                <h2 className="eyebrow">Demo</h2>
                <span>Shared data</span>
                <span>Changes are kept</span>
              </div>
            </div>
          </div>
        )}
        <div className={styles.footerBottom}>
          <div className={styles.footerAbout}>
            {!expanded && <Brand dark />}
            <span>Northbook is an independent demonstration and is not affiliated with any company.</span>
            {!expanded && <span>Demonstration only. No real funds move.</span>}
          </div>
          {expanded ? (
            <span>Demonstration only. No real funds move.</span>
          ) : (
            <nav aria-label="Footer">
              <Link href="/architecture">Architecture</Link>
              <a href="https://github.com/CodeExplorer29/northbook" target="_blank" rel="noreferrer">
                Source repository
              </a>
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}
