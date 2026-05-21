import http from 'http';
import fs from 'fs';
import path from 'path';
import handler from './api/telebox.js';
const root = process.cwd();
const server = http.createServer((req,res)=>{
  if(req.url.startsWith('/api/telebox')) return handler(req,res);
  const file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fp = path.join(root, file);
  if(fs.existsSync(fp) && fs.statSync(fp).isFile()) fs.createReadStream(fp).pipe(res);
  else {res.statusCode=404;res.end('Not Found');}
});
server.listen(process.env.PORT || 3000, ()=>console.log('Open http://localhost:'+(process.env.PORT || 3000)));
