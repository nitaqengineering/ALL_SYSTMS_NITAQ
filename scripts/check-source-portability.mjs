import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import {readSourceManifest} from './frontend-source.mjs';
const directory=await mkdtemp(join(tmpdir(),'nitaq-source-manifest-'));
try{
 const manifest=join(directory,'manifest.json'),source=join(directory,'01-fixture.jsx');
 await writeFile(manifest,JSON.stringify({version:1,files:['01-fixture.jsx']}));
 const fixture='/* multi-line\n comment retained by Babel */\nconst fixture = <span>Review</span>;\n';
 await writeFile(source,fixture);const linux=await readSourceManifest(manifest);
 await writeFile(source,fixture.replaceAll('\n','\r\n'));const windows=await readSourceManifest(manifest);
 assert.equal(windows,linux,'Windows and Linux source must produce identical compiler input');
 await writeFile(manifest,JSON.stringify({version:1,files:['../outside.jsx']}));await assert.rejects(readSourceManifest(manifest));
 console.log('PASS source portability: multi-line comments compile from identical LF/CRLF input; manifest traversal rejected');
}finally{
 const allowed=resolve(tmpdir())+sep+'nitaq-source-manifest-';
 if(!resolve(directory).startsWith(allowed))throw Error('Refusing cleanup outside owned temporary directory');
 await rm(directory,{recursive:true,force:true});
}
