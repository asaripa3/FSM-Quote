import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
const root=join(import.meta.dirname,'..');
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return {url:pathToFileURL(join(root,'tests/empty.mjs')).href,shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:pathToFileURL(join(root,specifier.slice(2)+'.ts')).href,shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(fileURLToPath(url)))return {url:url.href,shortCircuit:true};}
 return nextResolve(specifier,context);
}});
