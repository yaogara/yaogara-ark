import fs from "fs"
import path from "path"

const contentDir = "./content"
const outputFile = "./static/citations.json"

const citationMap = {}

// recursively scan .md files
function walk(dir) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath)
    } else if (file.endsWith(".md")) {
      parseFile(fullPath)
    }
  }
}

function parseFile(filePath) {
  const slug = path.basename(filePath, ".md")
  const data = fs.readFileSync(filePath, "utf8")

  const match = data.split(/^## References/m)
  if (match.length < 2) return // no references found

  const refs = match[1]
    .split(/\n+/)
    .filter((line) => line.match(/https?:\/\//))
    .map((line, i) => {
      const urlMatch = line.match(/https?:\/\/[^\s)]+/)
      const title = line.replace(/\[|\]|\(|\)/g, "").trim().slice(0, 120)
      return {
        id: i + 1,
        title: title || `Reference ${i + 1}`,
        url: urlMatch ? urlMatch[0] : null,
      }
    })

  if (refs.length) citationMap[slug] = refs
}

walk(contentDir)
fs.writeFileSync(outputFile, JSON.stringify(citationMap, null, 2))
console.log(`✅ Citation map created: ${Object.keys(citationMap).length} articles processed.`)