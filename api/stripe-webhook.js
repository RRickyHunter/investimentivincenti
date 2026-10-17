// Stripe webhook verification. Safe staging: no enrolment or outbound email yet.
// Requires STRIPE_TEST_WEBHOOK_SECRET configured on Vercel and a durable fulfillment store before production.
import crypto from 'node:crypto';
export const config = { api: { bodyParser: false } };
const okTypes = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed']);
async function rawBody(req) {const chunks=[];for await (const chunk of req) chunks.push(typeof chunk==='string'?Buffer.from(chunk):chunk);return Buffer.concat(chunks);}
function verify(raw, header, secret) {
  if (!header || !secret || !secret.startsWith('whsec_')) return false;
  const entries = header.split(',').map(x=>x.trim().split('='));
  const t = entries.find(x=>x[0]==='t')?.[1];
  const signatures = entries.filter(x=>x[0]==='v1').map(x=>x[1]);
  if (!t || !/^\d+$/.test(t) || Math.abs(Date.now()/1000-Number(t))>300 || !signatures.length) return false;
  const expected=crypto.createHmac('sha256',secret).update(t+'.'+raw.toString('utf8')).digest('hex');
  return signatures.some(s=>s?.length===expected.length && crypto.timingSafeEqual(Buffer.from(s,'ascii'),Buffer.from(expected,'ascii')));
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).end();
  const raw=await rawBody(req);
  if(raw.length>1024*1024)return res.status(413).end();
  if(!verify(raw,req.headers['stripe-signature'],process.env.STRIPE_TEST_WEBHOOK_SECRET))return res.status(400).json({error:'Invalid Stripe signature'});
  let event;try{event=JSON.parse(raw.toString('utf8'))}catch{return res.status(400).end();}
  if(event.livemode!==false)return res.status(400).json({error:'Only test events accepted'});
  if(!okTypes.has(event.type))return res.status(200).json({received:true,ignored:true});
  const session=event.data?.object;
  if(!session || session.object!=='checkout.session' || session.metadata?.event_key!=='frattali_2026_10')return res.status(200).json({received:true,ignored:true});
  const paid=event.type==='checkout.session.async_payment_succeeded'||(event.type==='checkout.session.completed'&&session.payment_status==='paid');
  if(!paid)return res.status(200).json({received:true,pending:true});
  // Fail closed: no fulfillment until CourseSprout API, transactional email, and durable idempotency are configured.
  // Returning a retryable code prevents a confirmed payment from being silently treated as fulfilled.
  console.error('FULFILLMENT_NOT_CONFIGURED',event.id,session.id);
  return res.status(503).json({error:'Fulfillment not configured; Stripe should retry'});
}
