import { defineConfig } from 'tsup'
//import copyStaticFile from "esbuild-copy-static-files"
//import AnalyzerPlugin from 'esbuild-analyzer'

 export default defineConfig({
    entry: [
        'src/index.ts'
    ],
    format: ['esm','cjs'],
    dts:true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake:true,  
    minify:true,
    terserOptions:{
        keep_classnames:true,
        mangle: false,
        keep_fnames: true,
    },
    cjsInterop:true,
    external:[ 
    ],      
    esbuildPlugins:[
        
    ]
}) 