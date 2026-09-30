import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {facilities,readFacility,summarize,summarizeHistory} from './data.mjs';
import {createProductionService,validDate} from './production.mjs';
const production=createProductionService();

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||8792);
const snapshots=new Map(), errors=new Map();
let running=false, started=0;
async function refresh() {
  running=true; started=Date.now(); errors.clear();
  try {
    for(const f of facilities.filter(f=>f.id)) {
      try { snapshots.set(f.key,await readFacility(f)); }
      catch(e) { errors.set(f.key,e.name==='TimeoutError'?'読取が時間切れになりました。':e.message); }
    }
  } finally { running=false; }
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)){res.writeHead(403);res.end();return;}
  if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end();return;}
  if(url.pathname==='/api/production'||url.pathname==='/api/production-detail') {
    const start=url.searchParams.get('start'),end=url.searchParams.get('end');
    if(!validDate(start)||!validDate(end)||start>end){res.writeHead(400);res.end();return;}
    try {const result=url.pathname==='/api/production'?production.summary(start,end,url.searchParams.get('refresh')==='1'):production.detail(url.searchParams.get('office'),start,end);
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result));
    }catch(e){res.writeHead(409,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message}));}return;
  }
  if(url.pathname==='/api/summary') {
    const month=url.searchParams.get('month');
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'')){res.writeHead(400);res.end();return;}
    if(!running && (Date.now()-started>300000 || (url.searchParams.get('refresh')==='1' && Date.now()-started>30000))) void refresh();
    const offices=facilities.map(f=>{
      const data=snapshots.get(f.key),error=errors.get(f.key);
      return {name:f.name,status:!f.id?'unmapped':error?'error':data?'ok':'loading',error,
        ...(data?{readAt:data.readAt,excluded:data.excluded,summary:summarize(data,month),history:summarizeHistory(data,month)}:{})};
    });
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({month,running,offices}));return;
  }
  const fileName=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','style.css','detail.css','app.js','production.js','production.css'].includes(fileName)){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(root,fileName);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]});
  fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`SNS dashboard: http://127.0.0.1:${port}/`));
