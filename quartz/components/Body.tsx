// @ts-ignore
import clipboardScript from "./scripts/clipboard.inline"
// @ts-ignore
import serviceWorkerScript from "./scripts/serviceWorker.inline"
import clipboardStyle from "./styles/clipboard.scss"
import { concatenateResources } from "../util/resources"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Body: QuartzComponent = ({ children }: QuartzComponentProps) => {
  return <div id="quartz-body">{children}</div>
}

// Register clipboard helpers and the offline-first cache once the DOM is ready
Body.afterDOMLoaded = concatenateResources(clipboardScript, serviceWorkerScript)
Body.css = clipboardStyle

export default (() => Body) satisfies QuartzComponentConstructor
