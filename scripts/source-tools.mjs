import {readFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
import {resolve,dirname} from 'node:path';
export async function sourceOf(path){
 const html=await readFile(path,'utf8');const scripts=[];
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  const source=m[1].match(/data-nitaq-source="([^"]+)"/);
  if(source){const code=await readFile(resolve(dirname(path),source[1]),'utf8');scripts.push({code,ast:parse(code,{sourceType:'unambiguous',plugins:['jsx']})});continue;}
  if(/\bsrc\s*=/.test(m[1])||!m[2].trim())continue;
  if(/type\s*=\s*['"]application\/(?:ld\+)?json/.test(m[1]))continue;
  const code=m[2];const ast=parse(code,{sourceType:'unambiguous',plugins:['jsx']});scripts.push({code,ast});
 }
 function extract(name){
  const hits=[];
  function walk(node,code,depth=0){
   if(!node||typeof node!=='object')return;
   if(node.type==='FunctionDeclaration'&&node.id?.name===name)hits.push({depth,code:code.slice(node.start,node.end)});
   if(node.type==='VariableDeclarator'&&node.id?.name===name)hits.push({depth,code:'const '+code.slice(node.start,node.end)+';'});
   for(const [key,value]of Object.entries(node))if(!['loc','start','end','extra','comments','tokens'].includes(key)){if(Array.isArray(value))for(const child of value)walk(child,code,depth+1);else if(value&&typeof value==='object')walk(value,code,depth+1);}
  }
  for(const s of scripts)walk(s.ast,s.code);
  hits.sort((a,b)=>a.depth-b.depth);if(!hits.length)throw Error('Missing function/constant '+name+' in '+path);return hits[0].code;
 }
 return {scripts,extract};
}
