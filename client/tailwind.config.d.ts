declare const _default: {
    darkMode: ["class"];
    content: string[];
    theme: {
        container: {
            center: true;
            padding: string;
            screens: {
                "2xl": string;
            };
        };
        extend: {
            colors: {
                ink: {
                    DEFAULT: string;
                    900: string;
                    800: string;
                    700: string;
                    600: string;
                    500: string;
                    400: string;
                    300: string;
                    200: string;
                    100: string;
                };
                gold: {
                    DEFAULT: string;
                    dark: string;
                    light: string;
                    soft: string;
                };
                cream: string;
                border: string;
                input: string;
                ring: string;
                background: string;
                foreground: string;
                primary: {
                    DEFAULT: string;
                    foreground: string;
                };
                secondary: {
                    DEFAULT: string;
                    foreground: string;
                };
                destructive: {
                    DEFAULT: string;
                    foreground: string;
                };
                muted: {
                    DEFAULT: string;
                    foreground: string;
                };
                accent: {
                    DEFAULT: string;
                    foreground: string;
                };
                popover: {
                    DEFAULT: string;
                    foreground: string;
                };
                card: {
                    DEFAULT: string;
                    foreground: string;
                };
                success: {
                    DEFAULT: string;
                    soft: string;
                };
                warning: {
                    DEFAULT: string;
                    soft: string;
                };
                danger: {
                    DEFAULT: string;
                    soft: string;
                };
                info: {
                    DEFAULT: string;
                    soft: string;
                };
            };
            fontFamily: {
                display: [string, string, string];
                sans: [string, string, string, string, string, string, string];
            };
            borderRadius: {
                lg: string;
                md: string;
                sm: string;
            };
            boxShadow: {
                soft: string;
                lift: string;
                gold: string;
            };
            keyframes: {
                "accordion-down": {
                    from: {
                        height: string;
                    };
                    to: {
                        height: string;
                    };
                };
                "accordion-up": {
                    from: {
                        height: string;
                    };
                    to: {
                        height: string;
                    };
                };
                "fade-in": {
                    from: {
                        opacity: string;
                    };
                    to: {
                        opacity: string;
                    };
                };
                "slide-up": {
                    from: {
                        opacity: string;
                        transform: string;
                    };
                    to: {
                        opacity: string;
                        transform: string;
                    };
                };
            };
            animation: {
                "accordion-down": string;
                "accordion-up": string;
                "fade-in": string;
                "slide-up": string;
            };
        };
    };
    plugins: {
        handler: () => void;
    }[];
};
export default _default;
