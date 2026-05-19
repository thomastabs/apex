import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        apex: {
          violet: "#7c3aed",
          sidebar: "#e8edf8",
          border: "#d9dce6",
          ink: "#111827",
          muted: "#7c8194"
        }
      }
    }
  },
  plugins: []
};

export default config;
