"use client";

import { FiAlertCircle, FiInbox, FiRefreshCw } from "react-icons/fi";

export type SkeletonVariant = "cards" | "list" | "workspace" | "calendar" | "chart";

export function PageSkeleton({ variant = "cards", label = "Loading content" }: { variant?: SkeletonVariant; label?: string }) {
  const count = variant === "list" ? 6 : variant === "calendar" ? 14 : variant === "workspace" ? 5 : 4;
  return <div className={`shared-skeleton shared-skeleton--${variant}`} role="status" aria-label={label} aria-busy="true"><span className="sr-only">{label}</span>{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <section className="shared-state shared-state--empty"><FiInbox/><h2>{title}</h2><p>{description}</p>{action}</section>;
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return <section className="shared-state shared-state--error" role="alert"><FiAlertCircle/><h2>{title}</h2><p>{description}</p>{onRetry&&<button className="pp-button secondary" type="button" onClick={onRetry}><FiRefreshCw/> Retry</button>}</section>;
}

export function InlinePending({ children = "Working…" }: { children?: React.ReactNode }) {
  return <span className="inline-pending" role="status"><FiRefreshCw/> {children}</span>;
}
