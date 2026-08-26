import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ---------- cores como variáveis CSS ----------
           Canais RGB separados (`5 15 38`) em vez de hex: permite trocar o tema
           em runtime E manter os modificadores de opacidade do Tailwind
           (`bg-elev/60`, `bg-gold-400/15`), que exigem canais.
           Os valores de cada tema vivem em `src/tema/temas.ts`. */
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        app: 'rgb(var(--c-app) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        elev: 'rgb(var(--c-elev) / <alpha-value>)',
        'elev-2': 'rgb(var(--c-elev-2) / <alpha-value>)',

        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-soft': 'rgb(var(--c-line-soft) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',

        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',

        gold: {
          200: 'rgb(var(--c-gold-200) / <alpha-value>)',
          300: 'rgb(var(--c-gold-300) / <alpha-value>)',
          400: 'rgb(var(--c-gold-400) / <alpha-value>)',
          500: 'rgb(var(--c-gold-500) / <alpha-value>)',
          600: 'rgb(var(--c-gold-600) / <alpha-value>)',
        },
        /* Texto sobre o ouro. No escuro é navy; no claro é branco — sem isto o
           rótulo do botão primário some no tema claro. */
        ongold: 'rgb(var(--c-ongold) / <alpha-value>)',

        navy: {
          100: 'rgb(var(--c-navy-100) / <alpha-value>)',
          200: 'rgb(var(--c-navy-200) / <alpha-value>)',
          300: 'rgb(var(--c-navy-300) / <alpha-value>)',
          500: 'rgb(var(--c-navy-500) / <alpha-value>)',
          600: 'rgb(var(--c-navy-600) / <alpha-value>)',
          700: 'rgb(var(--c-navy-700) / <alpha-value>)',
        },

        positive: 'rgb(var(--c-positive) / <alpha-value>)',
        negative: 'rgb(var(--c-negative) / <alpha-value>)',
        attention: 'rgb(var(--c-attention) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        /* Fundos suaves e bordas semânticas nunca recebem modificador de
           opacidade, então podem ser rgba pronta. */
        'positive-soft': 'var(--c-positive-soft)',
        'positive-line': 'var(--c-positive-line)',
        'negative-soft': 'var(--c-negative-soft)',
        'negative-line': 'var(--c-negative-line)',
        'attention-soft': 'var(--c-attention-soft)',
        'attention-line': 'var(--c-attention-line)',
        'info-soft': 'var(--c-info-soft)',
        'info-line': 'var(--c-info-line)',
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      /* ---------- escala tipográfica nomeada ----------
         Cada papel tem tamanho E peso próprios. Sem isso, "título" e "rótulo"
         viram o mesmo texto em cores diferentes. */
      fontSize: {
        kpi: ['30px', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '800' }],
        // usado em telas estreitas, onde 30px estouraria a largura do bloco
        'kpi-sm': ['22px', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '800' }],
        // número de apoio: totais de filtro, rodapé de formulário, linha de resumo
        num: ['15px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        title: ['17px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '700' }],
        section: ['12px', { lineHeight: '1.3', letterSpacing: '0.1em', fontWeight: '600' }],
        body: ['13px', { lineHeight: '1.55' }],
        cell: ['12.5px', { lineHeight: '1.45' }],
        caption: ['11px', { lineHeight: '1.45' }],
        label: ['10px', { lineHeight: '1.3', letterSpacing: '0.14em', fontWeight: '600' }],
        '2xs': ['10.5px', { lineHeight: '1.35' }],
      },

      /* ---------- espaçamento ---------- */
      spacing: { 4.5: '1.125rem', 13: '3.25rem', 18: '4.5rem' },

      borderRadius: {
        none: '0',
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
        full: '9999px',
      },

      /* A sombra também muda por tema: no claro, a sombra escura de tema escuro
         vira uma mancha suja em volta do cartão. */
      boxShadow: {
        painel: 'var(--sombra-painel)',
        flutuante: 'var(--sombra-flutuante)',
      },

      transitionDuration: { DEFAULT: '180ms' },
      transitionTimingFunction: { padrao: 'cubic-bezier(0.2, 0.6, 0.2, 1)' },

      keyframes: {
        surgir: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: { surgir: 'surgir 220ms cubic-bezier(0.2,0.6,0.2,1) both' },
    },
  },
  plugins: [],
} satisfies Config;
