import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import handler from './api/tbox.js';
const root = process.cwd();
const port = process.env.PORT || 3000;
const server = http.createServer(async (req,res)=>{
  if(req.url.startsWith('/api/')) return handler(req,res);
  try{
    let p = new URL(req.url,'http://local').pathname;
    if(p==='/'||!path.extname(p)) p='/index.html';
    const file = path.join(root,p);
    const data = await fs.readFile(file);
    const ext=path.extname(file).toLowerCase();
    res.setHeader('Content-Type', ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'application/javascript':'application/octet-stream');
    res.end(data);
  }catch(e){res.statusCode=404;res.end('Not Found');}
});
server.listen(port,()=>console.log('TeleBox Share ID UI running http://localhost:'+port));
