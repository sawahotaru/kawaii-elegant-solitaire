export default {
    plugins: {
        // Tailwind v4 で PostCSS プラグインが別パッケージに分離された。
        // autoprefixer は v4 本体（Lightning CSS）に内包されたため不要。
        '@tailwindcss/postcss': {},
    },
}
