import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'flux' | 'live';

export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={`button button--${variant} button--${size} ${className}`.trim()} {...props} />;
}

export function Badge({
  children,
  tone = 'neutral',
  dot = true,
  pulse = false,
  className = ''
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return <span className={`badge badge--${tone} ${pulse ? 'badge--pulse' : ''} ${className}`.trim()}>
    {dot ? <span className="badge__dot" aria-hidden="true" /> : null}
    {children}
  </span>;
}

export function Card({
  title,
  kicker,
  action,
  children,
  footer,
  className = ''
}: {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`.trim()}>
    {title || action || kicker ? <header className="card__header">
      <div className="card__heading">
        {kicker ? <div className="card__kicker">{kicker}</div> : null}
        {title ? <h2>{title}</h2> : null}
      </div>
      {action ? <div className="card__action">{action}</div> : null}
    </header> : null}
    <div className="card__body">{children}</div>
    {footer ? <footer className="card__footer">{footer}</footer> : null}
  </section>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className={`field ${error ? 'field--invalid' : ''}`.trim()}>
    <span className="field__label">{label}</span>
    {children}
    {hint && !error ? <span className="field__hint">{hint}</span> : null}
    {error ? <span className="field__error" role="alert"><span className="field__error-dot" aria-hidden="true" />{error}</span> : null}
  </label>;
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

export function SelectInput({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input select-input ${className}`.trim()} {...props} />;
}

export function ProgressSteps({ steps, current }: { steps: readonly string[]; current: number }) {
  return <ol className="progress-steps" aria-label="Workflow progress">
    {steps.map((step, index) => <li key={step} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''}>
      <div className="progress-steps__rail"><span className="progress-steps__node" />{index < steps.length - 1 ? <span className="progress-steps__line" /> : null}</div>
      <span className="progress-steps__label">{step}</span>
    </li>)}
  </ol>;
}

export function EmptyState({
  title,
  description,
  action,
  kicker = 'No records'
}: {
  title: string;
  description: string;
  action?: ReactNode;
  kicker?: string;
}) {
  return <div className="empty-state">
    <div className="empty-state__kicker">{kicker}</div>
    <strong>{title}</strong>
    <p>{description}</p>
    {action}
  </div>;
}

export function DataTable({
  headings,
  children,
  label,
  dense = false
}: {
  headings: readonly string[];
  children: ReactNode;
  label: string;
  dense?: boolean;
}) {
  return <div className={`table-wrap ${dense ? 'table-wrap--dense' : ''}`.trim()}>
    <table className="data-table">
      <caption className="sr-only">{label}</caption>
      <thead><tr>{headings.map((heading, index) => <th key={heading || index} scope="col">{heading}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

export function PageHeader({
  kicker,
  title,
  description,
  actions
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return <header className="page-header fnd-page-header">
    <div className="page-header__copy">
      {kicker ? <div className="fnd-page-kicker">{kicker}</div> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="page-header__actions">{actions}</div> : null}
  </header>;
}

export function Alert({
  tone = 'info',
  title,
  children
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  return <div className={`alert alert--${tone}`} role="status">
    <span className="alert__dot" aria-hidden="true" />
    <div>{title ? <strong>{title}</strong> : null}<div>{children}</div></div>
  </div>;
}

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return <div className="skeleton" role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: Math.max(1, lines) }, (_, index) => <span key={index} className="skeleton__line" />)}
  </div>;
}

export function Tabs({
  items,
  activeHref,
  label = 'Sections'
}: {
  items: readonly { label: string; href: string }[];
  activeHref: string;
  label?: string;
}) {
  return <nav className="tabs" aria-label={label}>
    {items.map((item) => <a key={item.href} href={item.href} aria-current={item.href === activeHref ? 'page' : undefined}>{item.label}</a>)}
  </nav>;
}

export type CommandAction = { label: string; href: string; hint?: string };

export function CommandPalette({
  open,
  query,
  onQueryChange,
  actions,
  onSelect,
  onClose,
  activeIndex = 0
}: {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  actions: readonly CommandAction[];
  onSelect: (action: CommandAction) => void;
  onClose: () => void;
  activeIndex?: number;
}) {
  if (!open) return null;
  return <div className="command-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="command-panel" role="dialog" aria-modal="true" aria-label="TADPODS command line" onMouseDown={(event) => event.stopPropagation()}>
      <div className="command-panel__input-row">
        <span className="command-panel__prompt" aria-hidden="true">›</span>
        <input
          autoFocus
          className="command-panel__input"
          placeholder="Type a command, record or action"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="command-results">
        {actions.length === 0 ? <div className="command-results__empty">No matching actions.</div> : null}
        {actions.map((action, index) => <a
          key={`${action.href}:${action.label}`}
          href={action.href}
          className={index === activeIndex ? 'is-active' : ''}
          onClick={(event) => { event.preventDefault(); onSelect(action); }}
        >
          <span>{action.label}</span>
          <span className="command-results__hint">{action.hint || (index === activeIndex ? 'ENTER' : '')}</span>
        </a>)}
      </div>
    </section>
  </div>;
}
