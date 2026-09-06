import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "LocalSWMM",
  description: "1D hydraulic modeling and simulation in the browser",
  base: "/docs/",
  outDir: "../public/docs",
  ignoreDeadLinks: true
})
