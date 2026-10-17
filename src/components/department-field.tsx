"use client";
import { Select } from "./ui/select";
import { TextField } from "./ui/text-field";

/**
 * A department `Select` once the university has a picklist, otherwise a free
 * `TextField` — same as today. Shared by sign-up, the invite dialog and
 * settings so all three switch over identically.
 */
export function DepartmentField({
  value,
  onChange,
  departments,
  className,
  minLength = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Canonical names for this university; undefined while still loading. */
  departments: string[] | undefined;
  className?: string;
  minLength?: number;
}) {
  if (departments?.length) {
    return (
      <Select
        label="Department"
        className={className}
        value={value}
        onValueChange={onChange}
        items={departments.map((d) => ({ value: d, label: d }))}
      />
    );
  }
  return (
    <TextField
      label="Department"
      className={className}
      required
      minLength={minLength}
      maxLength={80}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
