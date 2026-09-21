"use client";

/**
 * Nén ảnh scan ngay trên trình duyệt trước khi tải lên.
 *
 * Vì sao cần: máy scan hay lưu ảnh không nén. Bản hợp đồng dịch vụ Fenica 20 trang
 * nặng 66 MB, tức 3,3 MB mỗi trang. Đo thử trên chính file đó, hạ xuống ảnh xám
 * rộng 1240px (tương đương 150 DPI khổ A4) chất lượng 80 thì còn 238 KB mỗi trang,
 * nhỏ đi 14 lần mà chữ vẫn đọc rõ.
 *
 * Chỉ nén ảnh. File PDF cần thư viện riêng nên chưa nén ở bản này.
 */

/** Rộng 1240px xấp xỉ 150 DPI khổ A4, đủ đọc chữ trên văn bản scan. */
const RONG_TOI_DA = 1240;
const CHAT_LUONG = 0.8;

export type KetQuaNen = {
  file: File;
  daNen: boolean;
  dungLuongGoc: number;
};

export async function nenAnhNeuCan(file: File, nguongBytes: number): Promise<KetQuaNen> {
  const goc = file.size;
  if (!file.type.startsWith("image/") || goc < nguongBytes) {
    return { file, daNen: false, dungLuongGoc: goc };
  }

  try {
    const anh = await docAnh(file);
    if (anh.width <= RONG_TOI_DA) {
      anh.close?.();
      return { file, daNen: false, dungLuongGoc: goc };
    }

    const rong = RONG_TOI_DA;
    const cao = Math.round((anh.height * rong) / anh.width);
    const canvas = document.createElement("canvas");
    canvas.width = rong;
    canvas.height = cao;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, daNen: false, dungLuongGoc: goc };
    ctx.drawImage(anh as CanvasImageSource, 0, 0, rong, cao);
    anh.close?.();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", CHAT_LUONG),
    );
    // Nén xong mà không nhỏ hơn thì giữ bản gốc, đừng làm giảm chất lượng vô ích.
    if (!blob || blob.size >= goc) return { file, daNen: false, dungLuongGoc: goc };

    const tenMoi = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], tenMoi, { type: "image/jpeg", lastModified: file.lastModified }),
      daNen: true,
      dungLuongGoc: goc,
    };
  } catch {
    // Nén hỏng thì cứ tải bản gốc lên, không chặn người dùng vì một bước phụ.
    return { file, daNen: false, dungLuongGoc: goc };
  }
}

type AnhDoc = { width: number; height: number; close?: () => void };

async function docAnh(file: File): Promise<AnhDoc> {
  if (typeof createImageBitmap === "function") {
    return (await createImageBitmap(file)) as unknown as AnhDoc;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<AnhDoc>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img as unknown as AnhDoc);
      img.onerror = () => rej(new Error("Không đọc được ảnh"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
