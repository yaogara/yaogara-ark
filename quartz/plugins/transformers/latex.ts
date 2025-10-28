import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeMathjax from "rehype-mathjax/svg"
//@ts-ignore
import rehypeTypst from "@myriaddreamin/rehype-typst"
import { QuartzTransformerPlugin } from "../types"
import { KatexOptions } from "katex"
import { Options as MathjaxOptions } from "rehype-mathjax/svg"
//@ts-ignore
import { Options as TypstOptions } from "@myriaddreamin/rehype-typst"

interface Options {
  renderEngine: "katex" | "mathjax" | "typst"
  customMacros: MacroType
  katexOptions: Omit<KatexOptions, "macros" | "output">
  mathJaxOptions: Omit<MathjaxOptions, "macros">
  typstOptions: TypstOptions
}

interface MacroType {
  [key: string]: string
}

export const Latex: QuartzTransformerPlugin<Partial<Options>> = (opts) => {
  const engine = opts?.renderEngine ?? "katex"
  const macros = opts?.customMacros ?? {}
  return {
    name: "Latex",
    markdownPlugins() {
      return [remarkMath]
    },
    htmlPlugins() {
      switch (engine) {
        case "katex": {
          return [[rehypeKatex, { output: "html", macros, ...(opts?.katexOptions ?? {}) }]]
        }
        case "typst": {
          return [[rehypeTypst, opts?.typstOptions ?? {}]]
        }
        case "mathjax": {
          return [[rehypeMathjax, { macros, ...(opts?.mathJaxOptions ?? {}) }]]
        }
        default: {
          return [[rehypeMathjax, { macros, ...(opts?.mathJaxOptions ?? {}) }]]
        }
      }
    },
    externalResources() {
      switch (engine) {
        case "katex":
          return {
            js: [
              {
                loadTime: "afterDOMReady",
                contentType: "inline",
                script: `(() => {
  const cssHref = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
  const scriptSrc = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/copy-tex.min.js"
  const ensureResources = () => {
    if (!document.querySelector('.math')) {
      return
    }

    if (!document.querySelector('link[data-katex="true"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = cssHref
      link.media = 'print'
      link.onload = () => {
        link.media = 'all'
      }
      link.dataset.katex = 'true'
      document.head.appendChild(link)
    }

    if (!document.querySelector('script[data-katex-copy="true"]')) {
      const script = document.createElement('script')
      script.src = scriptSrc
      script.defer = true
      script.dataset.katexCopy = 'true'
      document.head.appendChild(script)
    }
  }

  const load = () => ensureResources()

  if (document.readyState === 'complete') {
    load()
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      load()
    }, { once: true })
  }

  document.addEventListener('nav', load)
})()`,
              },
            ],
          }
      }
    },
  }
}
