import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Cap kích thước request Server Action tránh spam payload lớn.
      // 1MB dư sức cho form nhập tay lớn nhất (căn có ~30 field text).
      bodySizeLimit: "1mb",
    },
  },
  async redirects() {
    return [
      // Trang Thông báo trước ở /alerts. Giữ đường cũ cho link đã lưu và cho
      // thông báo cũ đã gửi đi, khỏi rơi vào trang không tồn tại.
      { source: "/alerts", destination: "/notifications", permanent: true },
    ];
  },
};

export default nextConfig;
