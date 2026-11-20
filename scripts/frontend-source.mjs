import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
export async function readSourceManifest(path){
 const spec=JSON.parse(await readFile(path,'utf8'));
 if(spec.version!==1||!Array.isArray(spec.files)||!spec.files.length||spec.files.some(file=>!/^\d{2}-[a-z0-9-]+\.jsx$/.test(file))||new Set(spec.files).size!==spec.files.length)throw Error('Invalid frontend source manifest: '+path);
 return (await Promise.all(spec.files.map(file=>readFile(resolve(dirname(path),file),'utf8')))).join('');
}
export const readFrontendSource=name=>{
 if(!['accounting','crm'].includes(name))throw Error('Unknown frontend');
 return readSourceManifest('src/'+name+'/manifest.json');
};
