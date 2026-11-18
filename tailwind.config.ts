import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F6F7F8",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#202A32",
          soft: "#44525A",
        },
        muted: {
          DEFAULT: "#7B8790",
          soft: "#9AA5AC",
        },
        line: {
          DEFAULT: "#E8ECEE",
          subtle: "#EFF2F3",
        },
        brand: {
          DEFAULT: "#294F4D",
          deep: "#1D4140",
          light: "#EAF3F1",
        },
        success: {
          DEFAULT: "#247B60",
          bg: "#E8F3EE",
        },
        warning: {
          DEFAULT: "#AD782A",
          bg: "#FBF3E5",
        },
        danger: {
          DEFAULT: "#B34D4A",
          bg: "#F8EDEC",
        },
        unknown: "#78858B",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "DM Mono", "monospace"],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
