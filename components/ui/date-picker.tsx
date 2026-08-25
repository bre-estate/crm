"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse, isValid } from "date-fns";
import { vi } from "date-fns/locale";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value?: string; // yyyy-mm-dd
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * DatePicker: shadcn-style thay <input type="date">.
 * Value là chuỗi yyyy-mm-dd (khớp format DB). Popup DayPicker VN locale.
 * Bấm vào input → hiện calendar. Chọn ngày → close + onChange.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Chọn ngày",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const isValidSelected = selected && isValid(selected) ? selected : undefined;
  const display = isValidSelected ? format(isValidSelected, "dd/MM/yyyy") : "";

  const handleSelect = (d: Date | undefined) => {
    if (!d) {
      onChange?.("");
    } else {
      onChange?.(format(d, "yyyy-MM-dd"));
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "input flex items-center justify-between text-left",
          !display && "text-slate-400",
          className,
        )}
      >
        <span>{display || placeholder}</span>
        <svg
          className="w-4 h-4 text-slate-500 shrink-0 ml-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </PopoverTrigger>
      <PopoverContent className="p-2 w-auto">
        <DayPicker
          mode="single"
          selected={isValidSelected}
          onSelect={handleSelect}
          locale={vi}
          weekStartsOn={1}
          showOutsideDays
          captionLayout="dropdown"
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2035, 11)}
          className="text-xs"
          // Inline style trên .rdp-root — override được default vars (vars khai
          // báo trên .rdp-root nên set từ ancestor div KHÔNG có tác dụng).
          styles={{
            root: {
              "--rdp-day-height": "1.75rem",
              "--rdp-day-width": "1.75rem",
              "--rdp-day_button-height": "1.75rem",
              "--rdp-day_button-width": "1.75rem",
              "--rdp-nav_button-height": "1.5rem",
              "--rdp-nav_button-width": "1.5rem",
              "--rdp-nav-height": "2rem",
              "--rdp-weekday-padding": "0.15rem 0rem",
              "--rdp-months-gap": "0.5rem",
              "--rdp-font-family": "inherit",
              "--rdp-accent-color": "var(--primary)",
              "--rdp-accent-background-color":
                "color-mix(in oklch, var(--primary) 15%, transparent)",
            } as React.CSSProperties,
          }}
          footer={
            isValidSelected ? (
              <button
                type="button"
                onClick={() => handleSelect(undefined)}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                Xóa
              </button>
            ) : null
          }
        />
      </PopoverContent>
    </Popover>
  );
}
