"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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

/**
 * Wrapper cho shadcn Popover + Command. API giữ nguyên như legacy SearchableSelect
 * để mọi call-site không phải sửa. Filter case-insensitive + bỏ dấu tiếng Việt.
 */
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
  const [internal, setInternal] = useState<string>(() => String(defaultValue ?? ""));
  const currentValue = controlled ? String(valueProp ?? "") : internal;
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === currentValue);

  const select = (val: string) => {
    if (!controlled) setInternal(val);
    onChange?.(val);
    setOpen(false);
  };

  return (
    <>
      {name && (
        <input type="hidden" name={name} value={currentValue} required={required} />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <button
              type="button"
              aria-haspopup="listbox"
              className={cn(
                "input text-left w-full flex justify-between items-center",
                disabled && "!bg-slate-100 !text-slate-500 !cursor-not-allowed",
                className,
              )}
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
              <ChevronDown className="h-4 w-4 text-slate-400 ml-2 shrink-0" />
            </button>
          }
        />
        <PopoverContent className="p-0 w-72" align="start">
          <Command
            filter={(value, search) => {
              // value là composite chuỗi có label + sublabel
              const norm = (s: string) => stripDiacritics(s.toLowerCase());
              return norm(value).includes(norm(search)) ? 1 : 0;
            }}
          >
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>Không có kết quả</CommandEmpty>
              <CommandGroup>
                {emptyOption !== undefined && (
                  <CommandItem
                    value="__empty__"
                    onSelect={() => select("")}
                    className="italic text-slate-500"
                  >
                    <span className="w-4 mr-2" />
                    {emptyOption}
                  </CommandItem>
                )}
                {options.map((o) => {
                  const isSelected = String(o.value) === currentValue;
                  return (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.sublabel ?? ""}`}
                      onSelect={() => select(String(o.value))}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate">{o.label}</div>
                        {o.sublabel && (
                          <div className="text-xs text-muted-foreground truncate">
                            {o.sublabel}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
