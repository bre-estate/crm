import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Cap kích thước request Server Action tránh spam payload lớn.
      // 1MB dư sức cho form nhập tay lớn nhất (căn có ~30 field text).
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
