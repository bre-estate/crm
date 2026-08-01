/**
 * Layout primitives dùng chung cho MỌI trang trong app.
 * AppShell đã lo max-w-7xl mx-auto + padding.
 *
 * Convention:
 *   <PageContainer>
 *     <PageHeader title="..." subtitle="..." actions={<>...</>} />
 *     <FilterBar>...</FilterBar>            // optional, cho list page
 *     <SectionCard title="..." icon="...">  // optional, group nội dung
 *       <FieldGrid cols={4}>                // 4 field/dòng ở desktop, 2 tablet, 1 mobile
 *         <FormField label="..."><input .../></FormField>
 *       </FieldGrid>
 *     </SectionCard>
 *   </PageContainer>
 *
 * Grid breakpoints STANDARD (dùng cho mọi form + info block):
 *   1 mobile / 2 tablet (md) / 3-4 desktop (lg)
 */
import React from "react";

/**
 * Wrapper top-level cho mỗi trang.
 * KHÔNG thêm max-w — AppShell đã lo. Chỉ giữ space-y để các section cách đều.
 */
export function PageContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`space-y-4 ${className}`}>{children}</div>;
}

/**
 * Header chuẩn: title (h1), subtitle text-slate-500, actions (nút bên phải).
 * Wraps trên mobile — nút xuống dòng.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start flex-wrap gap-3">
      <div>
        {breadcrumb && <div className="text-xs mb-1">{breadcrumb}</div>}
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 items-center flex-wrap">{actions}</div>}
    </div>
  );
}

/**
 * Filter bar chuẩn — dùng cho list pages. Class đồng nhất /costs, /revenues, /invoices.
 * Bên trong dùng <FilterField> để label + input.
 */
export function FilterBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex gap-2 items-end flex-wrap ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * 1 field trong FilterBar: label nhỏ + input/select.
 * Input dùng class `input` (đã định nghĩa global). min-width cho input dùng minWidth prop.
 */
export function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

/**
 * Card section trắng, có border, padding. Dùng để nhóm nội dung.
 * Layout: title (with optional icon) trên đầu, children bên dưới, cách nhau bằng border-b nhỏ.
 */
export function SectionCard({
  title,
  icon,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  icon?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-card rounded-xl ring-1 ring-foreground/10 p-4 space-y-2 ${className}`}
    >
      {title && (
        <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-800">
            {icon && <span className="mr-1.5">{icon}</span>}
            {title}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Grid chuẩn cho FIELDS trong forms + Info blocks.
 * cols=4 (default): 1 mobile / 2 tablet / 4 desktop
 * cols=3: 1 mobile / 2 tablet / 3 desktop
 * cols=2: 1 mobile / 2 tablet trở lên
 */
export function FieldGrid({
  children,
  cols = 4,
  gap = 3,
  className = "",
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  gap?: 2 | 3 | 4;
  className?: string;
}) {
  const colClass =
    cols === 2
      ? "grid-cols-1 md:grid-cols-2"
      : cols === 3
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
  const gapClass = gap === 2 ? "gap-2" : gap === 4 ? "gap-4" : "gap-3";
  return <div className={`grid ${colClass} ${gapClass} ${className}`}>{children}</div>;
}

/**
 * 1 form field: label + control + optional hint.
 * required=true → * đỏ. full=true → chiếm full width (col-span).
 */
export function FormField({
  label,
  children,
  required,
  full,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
