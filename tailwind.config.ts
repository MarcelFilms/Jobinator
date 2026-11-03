import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4f0e6",
        ink: "#1c1915",
        moss: "#1e6b4a",
        mossdeep: "#134833",
        clay: "#8d4328",
        line: "#e3d9c8",
        card: "#fffdf8",
        private: "#f3e9f6",
        privatedeep: "#5c3d6e",
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(28, 25, 21, 0.04), 0 12px 32px rgba(28, 25, 21, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
