import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.qziky.immersiveclock",
  appName: "沉浸式时钟",
  webDir: "dist",
  plugins: {
    SystemBars: {
      hidden: false,
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
