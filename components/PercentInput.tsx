"use client";

import React from "react";

/**
 * PercentInput — thay thế <input type="text" inputMode="decimal"> cho các field %.
 * - Chặn ký tự "%" ngay khi gõ (onKeyDown)
 * - Strip mọi ký tự "%" đã lỡ dán vào (paste)
 * - Support cả controlled (value+onChange) và uncontrolled (defaultValue)
 *
 * Value truyền vào/ra là STRING số thập phân (VD "5,5" hoặc "5.5"), không có "%".
 * Server đọc như bình thường, parse sang float.
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export default function PercentInput({ onChange, onKeyDown, onPaste, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      onKeyDown={(e) => {
        if (e.key === "%") {
          e.preventDefault();
        }
        onKeyDown?.(e);
      }}
      onPaste={(e) => {
        onPaste?.(e);
        // Strip % after paste (setTimeout để đợi paste xong)
        setTimeout(() => {
          const el = e.currentTarget as HTMLInputElement | null;
          if (el && el.value.includes("%")) {
            el.value = el.value.replace(/%/g, "");
            // Trigger native input event để React state cập nhật
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }, 0);
      }}
      onChange={(e) => {
        if (e.target.value.includes("%")) {
          e.target.value = e.target.value.replace(/%/g, "");
        }
        onChange?.(e);
      }}
    />
  );
}
