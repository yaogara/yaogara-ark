// @ts-ignore: typescript doesn't know about our inline bundling system
// so we need to silence the error
import script from "./scripts/custom.inline"

export default (() => {
  function FontFix() {
    return null // This component doesn't render anything
  }

  FontFix.afterDOMLoaded = script
  return FontFix
}) satisfies QuartzComponentConstructor
