import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DocDiagram from './components/DocDiagram.vue'
import { reportPageviews } from './pageview'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('DocDiagram', DocDiagram)
    reportPageviews(router)
  },
} satisfies Theme
