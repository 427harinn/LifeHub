import type { ReactNode } from "react";

type FormRowProps = {
  label: string;
  summary?: string;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
};

export function FormRow({ label, summary, children, onClick, className = "", ariaLabel }: FormRowProps) {
  const content = (
    <>
      <span className="form-row__label">{label}</span>
      <span className="form-row__value">{summary ?? children}</span>
      {onClick ? <span className="form-row__chevron" aria-hidden="true">›</span> : null}
    </>
  );

  if (onClick) {
    return (
      <button aria-label={ariaLabel} className={`form-row form-row--interactive ${className}`.trim()} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className={`form-row ${className}`.trim()}>{content}</div>;
}
