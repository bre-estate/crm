"use client";

import { useLayoutEffect, useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorTarget = useRef<number | null>(null);
  const locked = disabled || readOnly;

  // Restore cursor position sau khi React re-render (fixes edit-in-middle bug).
  useLayoutEffect(() => {
    if (cursorTarget.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(cursorTarget.current, cursorTarget.current);
      cursorTarget.current = null;
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawValue = input.value;
    const cursorPos = input.selectionStart ?? rawValue.length;

    // Đếm số CHỮ SỐ (không tính dấu chấm) trước cursor
    const digitsBefore = rawValue.slice(0, cursorPos).replace(/[^\d]/g, "").length;

    const next = fmt(rawValue);
    setVal(next);

    // Tính lại vị trí cursor: sau chữ số thứ Nth trong chuỗi đã format
    let newCursor = 0;
    if (digitsBefore === 0) {
      newCursor = 0;
    } else {
      let count = 0;
      for (let i = 0; i < next.length; i++) {
        if (/\d/.test(next[i])) count++;
        if (count === digitsBefore) {
          newCursor = i + 1;
          break;
        }
      }
      if (count < digitsBefore) newCursor = next.length;
    }
    cursorTarget.current = newCursor;

    if (onValueChange) {
      const digits = next.replace(/[^\d]/g, "");
      onValueChange(digits ? Number(digits) : 0);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      name={name}
      value={val}
      onChange={handleChange}
      onFocus={(e) => e.currentTarget.select()}
      className={`${className ?? ""} ${locked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
      placeholder={placeholder ?? "0"}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
    />
  );
}
