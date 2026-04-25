import { defineConfig } from "tsup";
//import copyStaticFile from "esbuild-copy-static-files"
//import AnalyzerPlugin from 'esbuild-analyzer'

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: true,
    sourcemap: false,
    clean: true,
    treeshake: true,
    minify: true,
    cjsInterop: true,
});
