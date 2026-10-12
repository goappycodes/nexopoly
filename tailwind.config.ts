import type { Config } from "tailwindcss";

// Google Drive / Material 3 surface palette.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#F8FAFD",
        surface: "#FFFFFF",
        tint: "#F0F4F9",
        hover: "#E9EEF6",
        selected: "#C2E7FF",
        ink: "#1F1F1F",
        ink2: "#444746",
        muted: "#5E5E5E",
        outline: "#C4C7C5",
        line: "#E1E3E1",
        primary: "#0B57D0",
        primaryHover: "#0842A0",
        danger: "#B3261E",
        success: "#146C2E",
        warn: "#B06000",
      },
      fontFamily: {
        sans: ["var(--font-roboto)", "Roboto", "Arial", "sans-serif"],
        display: ["'Google Sans'", "var(--font-roboto)", "Roboto", "sans-serif"],
        mono: ["'Roboto Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        e1: "0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)",
        e2: "0 1px 2px 0 rgba(60,64,67,.3), 0 2px 6px 2px rgba(60,64,67,.15)",
        e3: "0 4px 8px 3px rgba(60,64,67,.15), 0 1px 3px rgba(60,64,67,.3)",
      },
    },
  },
  plugins: [],
};
export default config;
