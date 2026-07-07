"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  value: string | number;
  label: string;
  sublabel?: string;
};

type Props = {
  name?: string;
  options: SearchableOption[];
  value?: string | number | "";
  defaultValue?: string | number | "";
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyOption?: string;
  required?: boolean;
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export default function SearchableSelect({
  name,
  options,
  value: valueProp,
  defaultValue,
  onChange,
  placeholder = "Tìm kiếm...",
  disabled,
  className,
  emptyOption,
  required,
}: Props) {
  const controlled = valueProp !== undefined;
  const [internal, setInternal] = useState<string>(() =>
    String(defaultValue ?? ""),
  );
  const currentValue = controlled ? String(valueProp ?? "") : internal;

  const selected = useMemo(
    () => options.find((o) => String(o.value) === currentValue),
    [options, currentValue],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = stripDiacritics(query.trim().toLowerCase());
    if (!q) return options;
    return options.filter((o) => {
      const hay = stripDiacritics((o.label + " " + (o.sublabel ?? "")).toLowerCase());
      return hay.includes(q);
    });
  }, [options, query]);

  const select = (val: string) => {
    if (!controlled) setInternal(val);
    onChange?.(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      {name && <input type="hidden" name={name} value={currentValue} required={required} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`input text-left w-full flex justify-between items-center ${
          disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <span className="truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.sublabel && (
                <span className="text-slate-400 ml-1">· {selected.sublabel}</span>
              )}
            </>
          ) : (
            <span className="text-slate-400">{emptyOption ?? "— Chọn —"}</span>
          )}
        </span>
        <span className="text-slate-400 ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="input rounded-none border-0 border-b border-slate-200 focus:outline-none"
          />
          <div className="overflow-y-auto flex-1">
            {emptyOption !== undefined && (
              <button
                type="button"
                onClick={() => select("")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-500 italic border-b border-slate-100"
              >
                {emptyOption}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400 text-center">
                Không có kết quả
              </div>
            ) : (
              filtered.map((o) => {
                const isSelected = String(o.value) === currentValue;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => select(String(o.value))}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                      isSelected ? "bg-blue-100 font-semibold" : ""
                    }`}
                  >
                    <div>{o.label}</div>
                    {o.sublabel && (
                      <div className="text-xs text-slate-500">{o.sublabel}</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
