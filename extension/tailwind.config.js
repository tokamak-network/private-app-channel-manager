/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#037DD6",
          hover: "#0260A4",
          light: "#1098FC",
        },
        background: {
          DEFAULT: "#24272A",
          secondary: "#141618",
          elevated: "#2A2D31",
        },
        surface: {
          DEFAULT: "#141618",
          hover: "#1A1D20",
        },
        border: {
          DEFAULT: "#3B4046",
          light: "#4A5058",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#9FA6AE",
          tertiary: "#6A737D",
        },
        success: {
          DEFAULT: "#28A745",
          light: "#2ECC71",
        },
        error: {
          DEFAULT: "#D73847",
          light: "#E74C3C",
        },
        warning: {
          DEFAULT: "#FFD33D",
          light: "#F1C40F",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "8px",
        button: "4px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.24)",
        elevated: "0 4px 16px rgba(0, 0, 0, 0.32)",
      },
    },
  },
  plugins: [],
};
