import { i18n } from "../i18n"
import { FullSlug, getFileExtension, joinSegments, pathToRoot } from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import {
  getFontSpecificationName,
  googleFontHref,
  googleFontSubsetHref,
} from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { unescapeHTML } from "../util/escape"
import { CustomOgImagesEmitterName } from "../plugins/emitters/ogImage"

const fallbackSansSerif =
  'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'
const fallbackMono = "ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace"

const buildCriticalCss = (cfg: QuartzComponentProps["cfg"]): string => {
  const theme = cfg.theme
  const light = theme.colors.lightMode
  const dark = theme.colors.darkMode
  const titleFont = getFontSpecificationName(theme.typography.title || theme.typography.header)
  const headerFont = getFontSpecificationName(theme.typography.header)
  const bodyFont = getFontSpecificationName(theme.typography.body)
  const codeFont = getFontSpecificationName(theme.typography.code)

  return `:root{--light:${light.light};--lightgray:${light.lightgray};--gray:${light.gray};--darkgray:${light.darkgray};--dark:${light.dark};--secondary:${light.secondary};--tertiary:${light.tertiary};--highlight:${light.highlight};--textHighlight:${light.textHighlight};--titleFont:"${titleFont}",${fallbackSansSerif};--headerFont:"${headerFont}",${fallbackSansSerif};--bodyFont:"${bodyFont}",${fallbackSansSerif};--codeFont:"${codeFont}",${fallbackMono}}
:root[saved-theme="dark"]{--light:${dark.light};--lightgray:${dark.lightgray};--gray:${dark.gray};--darkgray:${dark.darkgray};--dark:${dark.dark};--secondary:${dark.secondary};--tertiary:${dark.tertiary};--highlight:${dark.highlight};--textHighlight:${dark.textHighlight}}
html{scroll-behavior:smooth;text-size-adjust:none;overflow-x:hidden;width:100vw}
body{margin:0;box-sizing:border-box;background-color:var(--light);font-family:var(--bodyFont);color:var(--darkgray)}
a{color:var(--secondary);font-weight:600;text-decoration:none;transition:color .2s ease}
a:hover{color:var(--tertiary)}
.page{max-width:1500px;margin:0 auto}
#quartz-root{display:block}
#quartz-body{display:grid;grid-template-columns:320px auto 320px;grid-template-rows:auto auto auto;column-gap:5px;row-gap:5px;grid-template-areas:"grid-sidebar-left grid-header grid-sidebar-right""grid-sidebar-left grid-center grid-sidebar-right""grid-sidebar-left grid-footer grid-sidebar-right"}
@media (min-width:800px) and (max-width:1200px){#quartz-body{grid-template-columns:320px auto;grid-template-rows:auto auto auto auto;grid-template-areas:"grid-sidebar-left grid-header""grid-sidebar-left grid-center""grid-sidebar-left grid-sidebar-right""grid-sidebar-left grid-footer"}}
@media (max-width:800px){#quartz-body{grid-template-columns:auto;grid-template-rows:auto auto auto auto auto;grid-template-areas:"grid-sidebar-left""grid-header""grid-center""grid-sidebar-right""grid-footer"}}
.sidebar.left{grid-area:grid-sidebar-left}
.sidebar.right{grid-area:grid-sidebar-right}
header{grid-area:grid-header;display:flex;align-items:center;gap:1.5rem;margin:2rem 0}
header h1{margin:0;flex:auto}
main{grid-area:grid-center}
footer{grid-area:grid-footer;text-align:left;opacity:.7;margin-bottom:4rem}`
}

export default (() => {
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
  }: QuartzComponentProps) => {
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const title =
      (fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title) + titleSuffix
    const fallbackDescription =
      fileData.frontmatter?.socialDescription ??
      fileData.frontmatter?.description ??
      unescapeHTML(fileData.description?.trim() ?? i18n(cfg.locale).propertyDefaults.description)

    const siteDescription =
      "Yaogará Ark — open ethnobotany archive documenting Amazonian teacher plants, ancestral pharmacology, and traditional ecological knowledge."
    const pageDescription = fallbackDescription || siteDescription

    const { css, js, additionalHead } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/icon.png")
    const criticalCss = buildCriticalCss(cfg)

    // Url of current page
    const socialUrl =
      fileData.slug === "404" ? url.toString() : joinSegments(url.toString(), fileData.slug!)

    const usesCustomOgImage = ctx.cfg.plugins.emitters.some(
      (e) => e.name === CustomOgImagesEmitterName,
    )
    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
            {cfg.theme.typography.title && (
              <link rel="stylesheet" href={googleFontSubsetHref(cfg.theme, cfg.pageTitle)} />
            )}
          </>
        )}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://plausible.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://ark.yaogara.org" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* Preload core assets to shorten the critical rendering path */}
        <link rel="preload" href={joinSegments(baseDir, "index.css")} as="style" />
        <link rel="preload" href={joinSegments(baseDir, "prescript.js")} as="script" />
        {/* Inline a small set of critical styles to stabilize the initial render */}
        <style>{criticalCss}</style>

        <meta name="og:site_name" content={cfg.pageTitle}></meta>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={pageDescription} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image:alt" content={pageDescription} />

        {!usesCustomOgImage && (
          <>
            <meta property="og:image" content={ogImageDefaultPath} />
            <meta property="og:image:url" content={ogImageDefaultPath} />
            <meta name="twitter:image" content={ogImageDefaultPath} />
            <meta
              property="og:image:type"
              content={`image/${getFileExtension(ogImageDefaultPath) ?? "png"}`}
            />
          </>
        )}

        {cfg.baseUrl && (
          <>
            <meta property="twitter:domain" content={cfg.baseUrl}></meta>
            <meta property="og:url" content={socialUrl}></meta>
            <meta property="twitter:url" content={socialUrl}></meta>
          </>
        )}

        <link
          rel="canonical"
          href={fileData.slug === "index" ? "https://ark.yaogara.org/" : socialUrl}
        />

        <link rel="icon" href={iconPath} />
        <meta name="description" content={pageDescription || siteDescription} />
        <meta name="generator" content="Quartz" />

        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
        {additionalHead.map((resource) => {
          if (typeof resource === "function") {
            return resource(fileData)
          } else {
            return resource
          }
        })}

        {/* ✅ Enhanced Schema.org for The Yaogará Ark */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["WebSite", "Dataset"],
              name: "The Yaogará Ark",
              url: `https://${cfg.baseUrl}`,
              inLanguage: "en",
              license: "https://creativecommons.org/licenses/by-sa/4.0/",
              description:
                "An open ethnobotanical archive documenting sacred plants and Indigenous ecological knowledge of the Amazon.",
              // ✅ Fix 1: isPartOf should be a Dataset, not a plain URL
              isPartOf: {
                "@type": "Dataset",
                name: "Yaogará Research Archive",
                url: "https://yaogara.com",
                description:
                  "A comprehensive dataset of ethnobotanical and ecological research data related to the Yaogará project.",
                license: "https://creativecommons.org/licenses/by-sa/4.0/",
                creator: {
                  "@type": "Organization",
                  name: "Yaogará Research Initiative",
                  url: "https://yaogara.com"
                }
              },
              // ✅ Fix 2: keep creator as an Organization
              creator: {
                "@type": "Organization",
                name: "Yaogará Research Initiative",
                url: "https://yaogara.com"
              },
              publisher: {
                "@type": "Organization",
                name: "Yaogará Research Initiative",
                url: "https://yaogara.com"
              }
            }),
          }}
        />

        {/* ✅ Plausible Analytics */}
        <script defer data-domain="yaogara.org" src="https://plausible.io/js/script.js"></script>
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
