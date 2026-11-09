import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=resolve(root,'.'+pathname);
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Nitaq: http://127.0.0.1:'+(process.env.PORT||4173)));
