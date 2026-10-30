import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DocDiagram from './components/DocDiagram.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocDiagram', DocDiagram)
  },
} satisfies Theme
