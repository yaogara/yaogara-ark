// Reapply font variables after Quartz client-side navigation
document.addEventListener("nav", () => {
  const root = document.documentElement
  root.style.setProperty("--titleFont", '"Schibsted Grotesk", system-ui, sans-serif')
  root.style.setProperty("--headerFont", '"Schibsted Grotesk", system-ui, sans-serif')
  root.style.setProperty("--bodyFont", '"Source Sans Pro", system-ui, sans-serif')
  root.style.setProperty("--codeFont", '"IBM Plex Mono", ui-monospace, monospace')
})
