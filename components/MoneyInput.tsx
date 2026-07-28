"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Parse chuỗi tiền có thể có dấu thập phân (VD copy-paste "37,414,177.31"
 * từ Excel). Bỏ phần thập phân, chỉ giữ integer (VND không dùng cent).
 * Handles cả 2 format: US ("37,414,177.31") + VN ("37.414.177,31").
 * Hỗ trợ số âm (dấu "-" ở đầu): "-1,000,000" → -1000000.
 */
function parseAmount(v: string): number {
  let s = v.trim();
  if (!s) return 0;
  const isNegative = s.startsWith("-");
  if (isNegative) s = s.slice(1).trim();

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep = "";
  if (lastComma > lastDot) {
    const afterComma = s.length - lastComma - 1;
    if (afterComma >= 1 && afterComma <= 2 && /^\d+$/.test(s.slice(lastComma + 1))) {
      decimalSep = ",";
    }
  } else if (lastDot > lastComma) {
    const afterDot = s.length - lastDot - 1;
    if (afterDot >= 1 && afterDot <= 2 && /^\d+$/.test(s.slice(lastDot + 1))) {
      decimalSep = ".";
    }
  }

  let intPart: string;
  if (decimalSep) {
    intPart = s.substring(0, s.lastIndexOf(decimalSep));
  } else {
    intPart = s;
  }
  const digits = intPart.replace(/[^\d]/g, "");
  const n = digits ? Number(digits) : 0;
  return isNegative ? -n : n;
}

function fmt(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? Math.trunc(v) : parseAmount(String(v));
  if (!n) return "";
  return n.toLocaleString("vi-VN");
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

    // Detect dấu - ở đầu (cho phép nhập số âm)
    const isNeg = rawValue.trim().startsWith("-");
    // Đếm số CHỮ SỐ (không tính dấu chấm) trước cursor
    const digitsBefore = rawValue.slice(0, cursorPos).replace(/[^\d]/g, "").length;

    const next = fmt(rawValue);
    // Nếu user vừa gõ "-" mà chưa có digit → giữ "-" hiển thị để user tiếp tục nhập
    const display = next === "" && isNeg ? "-" : next;
    setVal(display);

    let newCursor = 0;
    if (digitsBefore === 0) {
      newCursor = display.length;
    } else {
      let count = 0;
      for (let i = 0; i < display.length; i++) {
        if (/\d/.test(display[i])) count++;
        if (count === digitsBefore) {
          newCursor = i + 1;
          break;
        }
      }
      if (count < digitsBefore) newCursor = display.length;
    }
    cursorTarget.current = newCursor;

    if (onValueChange) {
      onValueChange(parseAmount(display));
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
      // Chặn browser autofill "Saved info" đè giá trị cũ vào field số tiền
      // (Chrome nhớ số nhập trước, gợi ý lại → dễ chọn nhầm thành 222 tỷ).
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
    />
  );
}
