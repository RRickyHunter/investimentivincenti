// Temporary public-source inspector: only reads the publicly published npm package.
import zlib from 'node:zlib';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const meta=await fetch('https://registry.npmjs.org/coursesprout-mcp/0.1.0');
  if(!meta.ok)return res.status(502).json({error:'npm metadata fetch failed',status:meta.status});
  const m=await meta.json();
  const b=await fetch(m.dist.tarball);
  if(!b.ok)return res.status(502).json({error:'npm tarball fetch failed',status:b.status});
  const raw=zlib.gunzipSync(Buffer.from(await b.arrayBuffer()));
  let off=0; const results=[];
  while(off+512<=raw.length){
    const header=raw.subarray(off,off+512);
    const file=header.subarray(0,100).toString('utf8').replace(/\0.*/,'');
    if(!file)break;
    const size=parseInt(header.subarray(124,136).toString('utf8').replace(/\0/g,'').trim(),8)||0;
    const body=raw.subarray(off+512,off+512+size);
    if(/\.(js|ts|md|json)$/.test(file)&&size<3000000){
      const txt=body.toString('utf8');
      for(const word of ['set_member_access','set-member-access','/set-access','setMemberAccess']){
        let at=txt.indexOf(word);let count=0;
        while(at!==-1&&count<5){results.push({file,word,snippet:txt.slice(Math.max(0,at-450),Math.min(txt.length,at+650))});at=txt.indexOf(word,at+word.length);count++;}
      }
    }
    off+=512+Math.ceil(size/512)*512;
  }
  res.status(200).json({packageVersion:m.version,results:results.slice(0,25)});
}