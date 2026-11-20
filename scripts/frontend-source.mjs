import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
export async function readSourceManifest(path){
 const spec=JSON.parse(await readFile(path,'utf8'));
 if(spec.version!==1||!Array.isArray(spec.files)||!spec.files.length||spec.files.some(file=>!/^\d{2}-[a-z0-9-]+\.jsx$/.test(file))||new Set(spec.files).size!==spec.files.length)throw Error('Invalid frontend source manifest: '+path);
 // Git normalizes new modules to LF on Linux; Windows checkouts may use CRLF.
 // Normalize before parsing so raw multi-line comments cannot change the built artifact.
 return (await Promise.all(spec.files.map(async file=>(await readFile(resolve(dirname(path),file),'utf8')).replace(/\r\n?/g,'\n')))).join('');
}
export const readFrontendSource=name=>{
 if(!['accounting','crm'].includes(name))throw Error('Unknown frontend');
 return readSourceManifest('src/'+name+'/manifest.json');
};
