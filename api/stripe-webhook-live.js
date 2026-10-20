// Independent LIVE webhook. Never accepts test events; activate only after live credentials and delivery checks.
import crypto from 'node:crypto';
import {grantFrattali} from './lib/coursesprout-frattali.js';
import {tagPurchase} from './lib/activecampaign-frattali.js';
export const config={api:{bodyParser:false}};
const PRICE='price_1USkpmRjl8noNUUHCoRsdmZq';
const allowed=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);
async function rawBody(req){const chunks=[];for await(const c of req)chunks.push(typeof c==='string'?Buffer.from(c):c);return Buffer.concat(chunks)}
function verified(raw,signature,secret){
 if(!signature||!secret?.startsWith('whsec_'))return false;
 const entries=signature.split(',').map(v=>v.trim().split('='));
 const ts=entries.find(e=>e[0]==='t')?.[1],sigs=entries.filter(e=>e[0]==='v1').map(e=>e[1]);
 if(!ts||!/^\d+$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300)return false;
 const digest=crypto.createHmac('sha256',secret).update(ts+'.'+raw.toString('utf8')).digest('hex');
 return sigs.some(s=>s?.length===digest.length&&crypto.timingSafeEqual(Buffer.from(s,'ascii'),Buffer.from(digest,'ascii')));
}
async function stripe(path,key){
 const r=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+key}});
 if(!r.ok)throw Error('Stripe verification failed '+r.status);
 return r.json();
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 const raw=await rawBody(req);
 if(raw.length>1024*1024)return res.status(413).end();
 if(!verified(raw,req.headers['stripe-signature'],process.env.STRIPE_LIVE_WEBHOOK_SECRET))return res.status(400).json({error:'Invalid signature'});
 let ev;try{ev=JSON.parse(raw.toString('utf8'))}catch{return res.status(400).end()}
 if(ev.livemode!==true||!allowed.has(ev.type))return res.status(200).json({ignored:true});
 const s=ev.data?.object;
 if(s?.object!=='checkout.session'||s.metadata?.event_key!=='frattali_2026_10'||s.metadata?.environment!=='live')return res.status(200).json({ignored:true});
 if(ev.type==='checkout.session.completed'&&s.payment_status!=='paid')return res.status(200).json({pending:true});
 const key=process.env.STRIPE_LIVE_SECRET_KEY;
 if(process.env.FRATTALI_LIVE_ENABLED!=='true'||!key?.startsWith('sk_live_')||!process.env.COURSESPROUT_API_KEY)return res.status(503).json({error:'Live fulfillment not configured'});
 try{
  const session=await stripe('checkout/sessions/'+encodeURIComponent(s.id),key);
  if(session.livemode!==true||session.payment_status!=='paid'||session.amount_total!==3900||session.currency!=='eur'||session.metadata?.event_key!=='frattali_2026_10'||session.metadata?.environment!=='live')
   return res.status(200).json({ignored:true});
  const li=await stripe('checkout/sessions/'+encodeURIComponent(s.id)+'/line_items?limit=10',key);
  if(li.has_more||li.data?.length!==1||li.data[0]?.price?.id!==PRICE||li.data[0]?.quantity!==1)return res.status(200).json({ignored:true});
  const email=(session.customer_details?.email||session.customer_email||'').trim().toLowerCase();
  const firstName=(session.metadata?.first_name||'').trim(),lastName=(session.metadata?.last_name||'').trim();
  if(!email||!firstName||!lastName)throw Error('Missing validated purchaser identity');
  const grant=await grantFrattali({email,firstName,lastName,key:process.env.COURSESPROUT_API_KEY});
  const tag=await tagPurchase({email,firstName,lastName});
  console.info('Frattali live fulfillment verified',s.id,grant.alreadyEnrolled?'already-enrolled':'new-grant',tag.alreadyTagged?'already-tagged':'tagged');
  return res.status(200).json({received:true});
 }catch(e){console.error('Frattali live fulfillment failed:',e.message);return res.status(503).json({error:'Fulfillment retry required'});}
}
