"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Project, Partner } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  project?: Project;
  partners: Partner[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRefreshBatdongsan?: () => Promise<{ ok: boolean; message: string }>;
};

export default function ProjectForm({ project, partners, onSave, onDelete, onRefreshBatdongsan }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [defaultSaleType, setDefaultSaleType] = useState<"primary" | "secondary">(
    (project?.defaultSaleType as "primary" | "secondary") ?? "primary",
  );
  const [partnerId, setPartnerId] = useState<number>(project?.partnerId ?? partners[0]?.id ?? 0);
  const [breRole, setBreRole] = useState<"f1" | "f2">((project?.breRole as "f1" | "f2") ?? "f1");
  const isSecondary = defaultSaleType === "secondary";

  const selectedPartner = partners.find((p) => p.id === partnerId);
  // Secondary → partnerCode "SCND" (đối tác trống). Server sẽ tự append số nếu full_code trùng.
  const partnerCode = isSecondary ? "SCND" : (selectedPartner?.code ?? "");
  const f1Partners = partners.filter((p) => p.type === "f1");

  return (
    <form
      action={(fd) => {
        fd.append("partnerCode", partnerCode);
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
            toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        });
      }}
      className="space-y-6 bg-card rounded-xl ring-1 ring-foreground/10 p-6"
    >
      <Section title="Thông tin cơ bản">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Loại giao dịch mặc định" required>
            <select
              name="defaultSaleType"
              value={defaultSaleType}
              onChange={(e) => setDefaultSaleType(e.target.value as "primary" | "secondary")}
              className="input"
            >
              <option value="primary">Sơ cấp</option>
              <option value="secondary">Thứ cấp</option>
            </select>
            <div className="text-[10px] text-slate-500 mt-1">
              Dự án có thể vừa sơ cấp vừa thứ cấp → tạo 2 record.
            </div>
          </Field>
          <Field label="Mã dự án (4 ký tự)" required>
            <input name="code" defaultValue={project?.code ?? ""} className="input" maxLength={8} required />
          </Field>
          <Field label="Tên dự án" required>
            <input name="name" defaultValue={project?.name ?? ""} className="input" required />
          </Field>
          {!isSecondary && (
            <>
              <Field label="Đối tác (CĐT/F1)" required>
                <select
                  name="partnerId"
                  value={partnerId}
                  onChange={(e) => setPartnerId(Number(e.target.value))}
                  className="input"
                  required
                >
                  {partners
                    .filter((p) => p.type === "cdt" || p.type === "f1")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type.toUpperCase()})
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Vai trò BRE">
                <select
                  name="breRole"
                  value={breRole}
                  onChange={(e) => setBreRole(e.target.value as "f1" | "f2")}
                  className="input"
                >
                  <option value="f1">F1 — nhận trực tiếp từ CĐT</option>
                  <option value="f2">F2 — nhận qua F1 liên kết</option>
                </select>
              </Field>
              {breRole === "f2" && (
                <Field label="Sàn F1 liên kết">
                  <select
                    name="linkedF1PartnerId"
                    defaultValue={project?.linkedF1PartnerId ?? ""}
                    className="input"
                  >
                    <option value="">— Chọn —</option>
                    {f1Partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}
          <Field label="Tình trạng HĐ">
            <select
              name="contractStatus"
              defaultValue={project?.contractStatus ?? "chua_ky"}
              className="input"
            >
              <option value="chua_ky">CHƯA KÝ</option>
              <option value="dang_dam_phan">ĐANG ĐÀM PHÁN</option>
              <option value="da_ky">ĐÃ KÝ</option>
              <option value="ngung_hop_tac">NGỪNG HỢP TÁC</option>
            </select>
          </Field>
          <Field label="Thông tin hợp đồng (số/ngày)" full>
            <textarea
              name="contractInfo"
              defaultValue={project?.contractInfo ?? ""}
              className="input"
              rows={2}
            />
          </Field>
        </div>
      </Section>

      <Section title="Tỷ lệ phí môi giới">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="%PMG_LK (BRE nhận) — VD: 5,5 nghĩa là 5,5%">
            <input
              name="brokerageRate"
              defaultValue={Number(((project?.brokerageRate ?? 0) * 100).toFixed(4))}
              className="input"
              type="text"
              inputMode="decimal"
            />
          </Field>
          <Field label="%PMG_LK_sale (trả F2 dưới, nếu có)">
            <input
              name="brokerageRateSale"
              defaultValue={Number(((project?.brokerageRateSale ?? 0) * 100).toFixed(4))}
              className="input"
              type="text"
              inputMode="decimal"
            />
          </Field>
          <Field label="Phí admin (VND, gồm VAT)">
            <MoneyInput name="adminFee" defaultValue={project?.adminFee ?? 0} className="input" />
          </Field>
          <Field label="Phí admin sale">
            <MoneyInput name="adminFeeSale" defaultValue={project?.adminFeeSale ?? 0} className="input" />
          </Field>
          <Field label="Biểu PMG (text - ghi chú)" full>
            <AutoGrowTextarea
              name="contractDocs"
              defaultValue={project?.contractDocs ?? ""}
              minRows={3}
              className="input"
              placeholder="VD: + Y<50%: 4.5%  + 50%-90%: 5%  + >90%: 5.5% (hồi tố)"
            />
          </Field>
        </div>
      </Section>

      {/* Thưởng CĐT/Cty đã bỏ — nhập per-căn ở ProductForm để linh hoạt. */}

      {!isSecondary && (
        <Section title="Đợt thanh toán & %PMG từng đợt (theo HĐ)">
          <div className="text-xs text-slate-500 -mt-2 mb-2">
            Data reference từ hợp đồng — lưu DB đầy đủ. Hiện chưa auto-lookup
            khi tạo revenue recon (dùng phase_number trên từng recon).
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Số đợt">
              <input
                name="paymentPhases"
                type="number"
                min="1"
                max="5"
                defaultValue={project?.paymentPhases ?? 1}
                className="input"
              />
            </Field>
            {[1, 2, 3, 4, 5].map((n) => (
              <Field key={n} label={`%PMG đợt ${n}`}>
                <input
                  name={`phaseRate${n}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={Number(
                    (((project?.[`phaseRate${n}` as keyof Project] as number) ?? 0) * 100).toFixed(4),
                  )}
                  className="input"
                />
              </Field>
            ))}
          </div>
        </Section>
      )}

      <Section title="📊 Thông tin thị trường (dự án tổng)">
        <div className="text-xs text-slate-500 -mt-2 mb-3">
          Info về toàn dự án (không chỉ căn BRE bán) để so sánh market share. Nhập tay từ website CĐT / Batdongsan / Sở XD.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Tổng căn dự án">
            <input
              type="number"
              name="totalUnits"
              defaultValue={project?.totalUnits ?? ""}
              className="input"
              placeholder="vd: 800"
              min="0"
            />
          </Field>
          <Field label="Giá TB tối thiểu (VND)">
            <input
              type="number"
              name="priceRangeMin"
              defaultValue={project?.priceRangeMin ?? ""}
              className="input"
              placeholder="vd: 2000000000"
              min="0"
              step="1000000"
            />
          </Field>
          <Field label="Giá TB tối đa (VND)">
            <input
              type="number"
              name="priceRangeMax"
              defaultValue={project?.priceRangeMax ?? ""}
              className="input"
              placeholder="vd: 8000000000"
              min="0"
              step="1000000"
            />
          </Field>
          <Field label="Bàn giao dự kiến">
            <input
              name="handoverExpected"
              defaultValue={project?.handoverExpected ?? ""}
              className="input"
              placeholder="vd: 2027-06 hoặc Q2 2027"
            />
          </Field>
          <Field label="Quận / Huyện">
            <input
              name="district"
              defaultValue={project?.district ?? ""}
              className="input"
              placeholder="vd: Dĩ An"
            />
          </Field>
          <Field label="Thành phố / Tỉnh">
            <input
              name="city"
              defaultValue={project?.city ?? ""}
              className="input"
              placeholder="vd: Bình Dương (nay TP.HCM)"
            />
          </Field>
        </div>
      </Section>

      <Section title="🔗 Nguồn tham chiếu">
        <div className="text-xs text-slate-500 -mt-2 mb-3">
          Link để tra cứu lại sau. Khi có URL, phase 2b sẽ auto-fill info từ trang tương ứng.
        </div>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Website CĐT (trang dự án)">
            <input
              type="url"
              name="developerWebsite"
              defaultValue={project?.developerWebsite ?? ""}
              className="input"
              placeholder="https://novaland.com.vn/aqua-city..."
            />
          </Field>
          <Field label="Batdongsan.com.vn URL dự án">
            <div className="flex gap-2 items-start">
              <input
                type="url"
                name="batdongsanUrl"
                defaultValue={project?.batdongsanUrl ?? ""}
                className="input flex-1"
                placeholder="https://batdongsan.com.vn/du-an/..."
              />
              {onRefreshBatdongsan && project?.batdongsanUrl && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      try {
                        const res = await onRefreshBatdongsan();
                        if (res.ok) toast.success(res.message);
                        else toast.error(res.message);
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Lỗi fetch");
                      }
                    });
                  }}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                  title="Fetch từ Batdongsan.com.vn và auto-fill 4 field: tổng căn, giá min/max, quận/TP, bàn giao"
                >
                  🔄 Fetch
                </button>
              )}
            </div>
            {project?.dataUpdatedAt && (
              <div className="text-[10px] text-slate-500 mt-1">
                Data cập nhật lần cuối: {new Date(project.dataUpdatedAt).toLocaleString("vi-VN")}
              </div>
            )}
          </Field>
          <Field label="CafeLand URL dự án">
            <input
              type="url"
              name="cafelandUrl"
              defaultValue={project?.cafelandUrl ?? ""}
              className="input"
              placeholder="https://cafeland.vn/du-an/..."
            />
          </Field>
          <Field label="Nguồn data (mô tả ngắn)">
            <input
              name="dataSourceNote"
              defaultValue={project?.dataSourceNote ?? ""}
              className="input"
              placeholder="vd: CĐT gửi report T7/2026 + Sở XD Q2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Hồ sơ & ghi chú">
        <div className="grid grid-cols-1 gap-4">
          <Field label="Hồ sơ ĐNTT (text)">
            <textarea
              name="paymentDocs"
              defaultValue={project?.paymentDocs ?? ""}
              className="input"
              rows={3}
            />
          </Field>
          <Field label="Ghi chú">
            <textarea name="note" defaultValue={project?.note ?? ""} className="input" rows={2} />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end gap-3 pt-2">
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (confirm(`Xóa dự án "${project?.name}"?`)) {
                start(async () => {
                  try {
                    await onDelete();
                  } catch (e) {
                    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
                    toast.error(e instanceof Error ? e.message : "Không xóa được");
                  }
                });
              }
            }}
            disabled={pending}
          >
            Xóa
          </Button>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-700 pb-2 border-b border-slate-100">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function AutoGrowTextarea({
  name,
  defaultValue,
  minRows = 3,
  className,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  minRows?: number;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    resize();
  }, []);
  return (
    <textarea
      ref={ref}
      name={name}
      defaultValue={defaultValue}
      rows={minRows}
      onInput={resize}
      className={className}
      placeholder={placeholder}
      style={{ overflow: "hidden", resize: "vertical" }}
    />
  );
}
