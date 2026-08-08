import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`button button--${variant} ${className}`.trim()} {...props} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{title || action ? <header className="card__header"><h2>{title}</h2>{action}</header> : null}<div className="card__body">{children}</div></section>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span className="field__label">{label}</span>{children}{hint ? <span className="field__hint">{hint}</span> : null}{error ? <span className="field__error" role="alert">{error}</span> : null}</label>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function ProgressSteps({ steps, current }: { steps: readonly string[]; current: number }) {
  return <ol className="progress-steps" aria-label="Workflow progress">{steps.map((step, index) => <li key={step} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''}><span>{index + 1}</span>{step}</li>)}</ol>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function DataTable({ headings, children, label }: { headings: readonly string[]; children: ReactNode; label: string }) {
  return <div className="table-wrap"><table><caption className="sr-only">{label}</caption><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
