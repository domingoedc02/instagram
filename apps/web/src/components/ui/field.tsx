import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldProps = ComponentProps<"input"> & {
  id: string;
  label: string;
  /** Always-visible guidance, read after the label. */
  hint?: ReactNode;
  /** Validation message; marks the input invalid and is announced. */
  error?: string | undefined;
  /** Live status under the input (e.g. a username check). Pass "" to keep the region mounted. */
  status?: ReactNode;
  /** Rendered inside the input row, after the input (e.g. a show-password toggle). */
  trailing?: ReactNode;
};

/**
 * Label + input + hint + error, wired for assistive tech: the hint and error are linked with
 * aria-describedby, and an error sets aria-invalid (WCAG 2.2 AA 1.3.1, 3.3.1, 4.1.2).
 */
export function Field({
  id,
  label,
  hint,
  error,
  status,
  trailing,
  className,
  ...input
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const statusId = status === undefined ? undefined : `${id}-status`;
  const describedBy = [hintId, statusId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-base outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive",
            trailing ? "pr-20" : undefined,
            className,
          )}
          {...input}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {status === undefined ? null : (
        <p id={statusId} className="text-xs" aria-live="polite">
          {status}
        </p>
      )}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
