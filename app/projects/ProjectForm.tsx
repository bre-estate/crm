"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Project, Partner } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";

type Props = {
  project?: Project;
  partners: Partner[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export default function ProjectForm({ project, partners, onSave, onDelete }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<number>(project?.partnerId ?? partners[0]?.id ?? 0);
  const [breRole, setBreRole] = useState<"f1" | "f2">((project?.breRole as "f1" | "f2") ?? "f1");

  const selectedPartner = partners.find((p) => p.id === partnerId);
  const partnerCode = selectedPartner?.code ?? "";
  const f1Partners = partners.filter((p) => p.type === "f1");

  return (
    <form
      action={(fd) => {
        fd.append("partnerCode", partnerCode);
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            alert(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        });
      }}
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      <Section title="Thông tin cơ bản">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mã dự án (4 ký tự)" required>
            <input name="code" defaultValue={project?.code ?? ""} className="input" maxLength={8} required />
          </Field>
          <Field label="Tên dự án" required>
            <input name="name" defaultValue={project?.name ?? ""} className="input" required />
          </Field>
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="%PMG_LK (BRE nhận) — VD: 5.5 nghĩa là 5,5%">
            <input
              name="brokerageRate"
              defaultValue={Number(((project?.brokerageRate ?? 0) * 100).toFixed(4))}
              className="input"
              type="number"
              step="any"
            />
          </Field>
          <Field label="%PMG_LK_sale (trả F2 dưới, nếu có)">
            <input
              name="brokerageRateSale"
              defaultValue={Number(((project?.brokerageRateSale ?? 0) * 100).toFixed(4))}
              className="input"
              type="number"
              step="any"
            />
          </Field>
          <Field label="Phí admin (VND, gồm VAT)">
            <MoneyInput name="adminFee" defaultValue={project?.adminFee ?? 0} className="input" />
          </Field>
          <Field label="Phí admin sale">
            <MoneyInput name="adminFeeSale" defaultValue={project?.adminFeeSale ?? 0} className="input" />
          </Field>
          <Field label="Biểu PMG (text - ghi chú)" full>
            <textarea
              name="contractDocs"
              defaultValue={project?.contractDocs ?? ""}
              className="input"
              rows={3}
              placeholder="VD: + Y<50%: 4.5%  + 50%-90%: 5%  + >90%: 5.5% (hồi tố)"
            />
          </Field>
        </div>
      </Section>

      <Section title="Đợt thanh toán & %PMG từng đợt">
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
                type="number"
                step="any"
                defaultValue={Number(
                  (((project?.[`phaseRate${n}` as keyof Project] as number) ?? 0) * 100).toFixed(4),
                )}
                className="input"
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Thưởng / Chi phí khác">
        <div className="grid grid-cols-2 gap-4">
          <Field label="CĐT thưởng sale (VND, gồm VAT)">
            <MoneyInput name="cdtBonusSale" defaultValue={project?.cdtBonusSale ?? 0} className="input" />
          </Field>
          <Field label="CĐT thưởng quản lý">
            <MoneyInput name="cdtBonusManager" defaultValue={project?.cdtBonusManager ?? 0} className="input" />
          </Field>
          <Field label="CTY thưởng sale">
            <MoneyInput name="ctyBonusSale" defaultValue={project?.ctyBonusSale ?? 0} className="input" />
          </Field>
          <Field label="CTY thưởng quản lý">
            <MoneyInput name="ctyBonusManager" defaultValue={project?.ctyBonusManager ?? 0} className="input" />
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
          <button
            type="button"
            onClick={() => {
              if (confirm(`Xóa dự án "${project?.name}"?`)) {
                start(async () => {
                  try {
                    await onDelete();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "Không xóa được");
                  }
                });
              }
            }}
            className="px-4 py-2 text-red-600 border border-red-300 rounded-lg text-sm hover:bg-red-50"
            disabled={pending}
          >
            Xóa
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
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
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
