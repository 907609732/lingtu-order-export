import {defineConfig} from 'vite'
export default defineConfig({
  ssr:{noExternal:true},
  build:{ssr:'src/mcp/index.ts',target:'node22',outDir:'out/mcp',emptyOutDir:true,minify:false,
    rollupOptions:{output:{entryFileNames:'server.mjs',inlineDynamicImports:true}}}
})
