import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ticksPerSecond } from "../sim-adapter";

interface IconButtonProps {
  label: string;
  icon: LucideIcon;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children?: ReactNode;
}

export function IconButton({
  label,
  icon: Icon,
  pressed,
  disabled,
  className = "",
  onClick,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button ${pressed ? "is-pressed" : ""} ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export const humanize = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());

export const formatScore = (value: number): string => {
  const normalized = Math.abs(value) > 1.5 ? value / 1000 : value;
  return normalized.toFixed(2);
};

export const tickLabel = (tick: number): string =>
  `${Math.floor(tick / ticksPerSecond)}s · tick ${tick.toLocaleString()}`;

export function Meter({
  label,
  value,
  tone = "moss",
  inverse = false,
}: {
  label: string;
  value: number;
  tone?: "moss" | "coral" | "water" | "gold";
  inverse?: boolean;
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div
      className="meter"
      aria-label={`${label}: ${Math.round(bounded)} percent`}
      title={`${Math.round(bounded)}%`}
    >
      <div className="meter__label">
        <span>{label}</span>
        <span className="number">{Math.round(bounded)}</span>
      </div>
      <div
        className={`meter__track meter__track--${tone}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bounded)}
      >
        <span
          className={inverse ? "meter__fill meter__fill--inverse" : "meter__fill"}
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  children,
  annotation,
}: {
  icon: LucideIcon;
  children: ReactNode;
  annotation?: string;
}) {
  return (
    <div className="section-title">
      <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
      <h3>{children}</h3>
      {annotation ? <span>{annotation}</span> : null}
    </div>
  );
}
