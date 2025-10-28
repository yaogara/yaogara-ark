if ("serviceWorker" in navigator) {
  let hasRegistered = false
  const register = () => {
    if (hasRegistered) {
      return
    }
    hasRegistered = true
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed", error)
    })
  }

  if (document.readyState === "complete") {
    register()
  } else {
    window.addEventListener(
      "load",
      () => {
        register()
      },
      { once: true },
    )
  }

  document.addEventListener("nav", register, { once: true })
}
