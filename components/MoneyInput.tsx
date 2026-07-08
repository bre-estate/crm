"use client";

import { useState } from "react";

function fmt(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const digits = String(v).replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
}

type Props = {
  name: string;
  defaultValue?: number | string | null;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (v: number) => void;
};

export default function MoneyInput({
  name,
  defaultValue,
  className,
  placeholder,
  required,
  disabled,
  readOnly,
  onValueChange,
}: Props) {
  const [val, setVal] = useState(fmt(defaultValue ?? ""));
  const locked = disabled || readOnly;
  return (
    <input
      type="text"
      inputMode="numeric"
      name={name}
      value={val}
      onChange={(e) => {
        const next = fmt(e.target.value);
        setVal(next);
        if (onValueChange) {
          const digits = next.replace(/[^\d]/g, "");
          onValueChange(digits ? Number(digits) : 0);
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      className={`${className ?? ""} ${locked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
      placeholder={placeholder ?? "0"}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
    />
  );
}
