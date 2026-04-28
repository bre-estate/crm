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
};

export default function MoneyInput({
  name,
  defaultValue,
  className,
  placeholder,
  required,
}: Props) {
  const [val, setVal] = useState(fmt(defaultValue ?? ""));
  return (
    <input
      type="text"
      inputMode="numeric"
      name={name}
      value={val}
      onChange={(e) => setVal(fmt(e.target.value))}
      onFocus={(e) => e.currentTarget.select()}
      className={className}
      placeholder={placeholder ?? "0"}
      required={required}
    />
  );
}
