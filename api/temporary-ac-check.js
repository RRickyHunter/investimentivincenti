// Read-only ActiveCampaign configuration check; no PII, API keys or server URLs returned.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).end();
 const raw=process.env.ACTIVECAMPAIGN_API_URL?.trim(),key=process.env.ACTIVECAMPAIGN_API_KEY?.trim();
 if(!raw||!key)return res.status(503).json({ok:false,stage:'configuration'});
 try{
  const u=new URL(raw);if(u.protocol!=='https:')throw Error('Bad URL scheme');
  const base=u.pathname.replace(/\/+$/,'').replace(/\/api\/3$/,'');
  const url=u.origin+base+'/api/3/tags?limit=1';
  const result=await fetch(url,{headers:{'Api-Token':key,Accept:'application/json'},signal:AbortSignal.timeout(9000)});
  return res.status(result.ok?200:502).json({ok:result.ok,stage:'authorization',upstream_status:result.status});
 }catch(e){return res.status(502).json({ok:false,stage:'connection'});}
}