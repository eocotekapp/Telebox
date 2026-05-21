import http from 'node:http';
import fs from 'node:fs/promises';
import handler from './api/test.js';
const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/test')) return handler(req,res);
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end(await fs.readFile('./index.html','utf8'));
});
server.listen(3000,()=>console.log('Open http://localhost:3000'));
