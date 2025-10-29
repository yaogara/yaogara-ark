import { randomUUID } from "crypto"
import { JSX } from "preact/jsx-runtime"
import { QuartzPluginData } from "../plugins/vfile"

export type JSResource = {
  loadTime: "beforeDOMReady" | "afterDOMReady"
  moduleType?: "module"
  spaPreserve?: boolean
  defer?: boolean
  crossOrigin?: "anonymous" | "use-credentials"
} & (
  | {
      src: string
      contentType: "external"
    }
  | {
      script: string
      contentType: "inline"
    }
)

export type CSSResource = {
  content: string
  inline?: boolean
  spaPreserve?: boolean
  lazy?: boolean
  rel?: "stylesheet" | "preload"
  as?: string
  crossOrigin?: "anonymous" | "use-credentials"
}

export function JSResourceToScriptElement(resource: JSResource, preserve?: boolean): JSX.Element {
  const scriptType = resource.moduleType ?? "application/javascript"
  const spaPreserve = preserve ?? resource.spaPreserve
  if (resource.contentType === "external") {
    const defer = resource.defer ?? true
    return (
      <script
        key={resource.src}
        src={resource.src}
        type={scriptType}
        spa-preserve={spaPreserve}
        defer={defer}
        crossOrigin={resource.crossOrigin}
      />
    )
  } else {
    const content = resource.script
    return (
      <script
        key={randomUUID()}
        type={scriptType}
        spa-preserve={spaPreserve}
        dangerouslySetInnerHTML={{ __html: content }}
      ></script>
    )
  }
}

export function CSSResourceToStyleElement(resource: CSSResource, preserve?: boolean): JSX.Element {
  const spaPreserve = preserve ?? resource.spaPreserve
  if (resource.inline ?? false) {
    return <style>{resource.content}</style>
  } else {
    const rel = resource.rel ?? "stylesheet"
    const deferStyles = resource.lazy && rel === "stylesheet"
    const onLoad = deferStyles
      ? (event: JSX.TargetedEvent<HTMLLinkElement, Event>) => {
          const element = event.currentTarget
          if (element?.media === "print") {
            element.media = "all"
          }
        }
      : undefined
    return (
      <link
        key={resource.content}
        href={resource.content}
        rel={rel}
        type={rel === "stylesheet" ? "text/css" : undefined}
        as={resource.as}
        crossOrigin={resource.crossOrigin}
        media={deferStyles ? "print" : undefined}
        onLoad={onLoad}
        spa-preserve={spaPreserve}
      />
    )
  }
}

export interface StaticResources {
  css: CSSResource[]
  js: JSResource[]
  additionalHead: (JSX.Element | ((pageData: QuartzPluginData) => JSX.Element))[]
}

export type StringResource = string | string[] | undefined
export function concatenateResources(...resources: StringResource[]): StringResource {
  return resources
    .filter((resource): resource is string | string[] => resource !== undefined)
    .flat()
}
