import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.ts"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#080808",
        panel: "#131313",
        panelSoft: "#1c1c1c",
        line: "#2a2a2a",
        accent: "#ff3b30",
        accentSoft: "#ff7b72",
        cream: "#f7f2eb"
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "sans-serif"],
        body: ["var(--font-space)", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255, 59, 48, 0.25), 0 20px 60px rgba(255, 59, 48, 0.18)"
      },
      backgroundImage: {
        "radial-stage": "radial-gradient(circle at top, rgba(255,59,48,0.20), transparent 38%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08), transparent 24%)"
      }
    }
  },
  plugins: []
};

export default config;
