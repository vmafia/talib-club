import react from "@vitejs/plugin-react"
import { build, createServer, preview } from "vite"
import path from "path"

const command = process.argv[2] || "dev"

const viteConfig = {
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase/firestore") || id.includes("@firebase/firestore")) {
              return "vendor-firebase-firestore"
            }
            if (id.includes("firebase/auth") || id.includes("@firebase/auth")) {
              return "vendor-firebase-auth"
            }
            if (id.includes("firebase/storage") || id.includes("@firebase/storage")) {
              return "vendor-firebase-storage"
            }
            if (id.includes("firebase/app") || id.includes("@firebase/app")) {
              return "vendor-firebase-app"
            }
            if (id.includes("firebase")) {
              return "vendor-firebase-core"
            }
            if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) {
              return "vendor-react"
            }
            return "vendor-others"
          }
        }
      }
    }
  }
}

if (command === "build") {
  await build(viteConfig)
  try {
    console.log("Running sitemap generator...")
    await import("./generate-sitemap.mjs")
  } catch (err) {
    console.error("Failed to run sitemap generator:", err)
  }
} else if (command === "preview") {
  const server = await preview(viteConfig)
  server.printUrls()
} else if (command === "dev") {
  const server = await createServer({
    ...viteConfig,
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
    },
  })
  await server.listen()
  server.printUrls()
} else {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}
