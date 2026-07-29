"use client";

/**
 * Chevron toggle button chung cho các row expand/collapse trong table.
 * Hitbox 32×32, chevron 18px, có aria + hover state rõ ràng.
 * Dùng cho: /reports/hr-checks, và có thể tái sử dụng nơi khác.
 */
export default function ExpandToggle({
  isOpen,
  onClick,
  label,
}: {
  isOpen: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={label ?? (isOpen ? "Thu gọn" : "Xem chi tiết")}
      className={`w-8 h-8 flex items-center justify-center rounded-md border transition-colors ${
        isOpen
          ? "bg-orange-500 border-orange-500 text-white hover:bg-orange-600"
          : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
