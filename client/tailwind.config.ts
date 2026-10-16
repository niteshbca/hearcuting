import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: {
        "2xl": "1320px",
      },
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0B0C",
          900: "#0B0B0C",
          800: "#161618",
          700: "#232326",
          600: "#3A3A3E",
          500: "#6B6B70",
          400: "#9A9A9F",
          300: "#C4C4C8",
          200: "#E2E2E5",
          100: "#F1F1F3",
        },
        gold: {
          DEFAULT: "#C6A15B",
          dark: "#A9853F",
          light: "#E7D3A1",
          soft: "#F5EEDF",
        },
        cream: "#FAF7F2",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "#1F7A4D",
          soft: "#E6F4EC",
        },
        warning: {
          DEFAULT: "#9A6B00",
          soft: "#FBF1DA",
        },
        danger: {
          DEFAULT: "#B3261E",
          soft: "#FBE9E7",
        },
        info: {
          DEFAULT: "#1F5FA8",
          soft: "#E7F0FB",
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.625rem",
        sm: "0.5rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(11,11,12,0.04), 0 8px 24px -12px rgba(11,11,12,0.12)",
        lift: "0 2px 4px rgba(11,11,12,0.05), 0 18px 40px -18px rgba(11,11,12,0.22)",
        gold: "0 10px 30px -12px rgba(198,161,91,0.55)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
