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
  // CourseSprout is a live account even when Stripe is in test mode.
  // Only the explicitly allowed test address can ever be enrolled here.
  const allowedCustomerId = 'cus_VSY4i3mC8ZrV2d'; // Exact existing paid TEST Customer; never a live Stripe Customer.
  const apiKey = process.env.COURSESPROUT_API_KEY;
  if (!apiKey || !process.env.STRIPE_TEST_SECRET_KEY?.startsWith('sk_test_')) {
    return res.status(503).json({error:'Test fulfillment not yet configured'});
  }
  try {
    // Do not trust a browser redirect for fulfillment. Read the canonical Stripe customer.
    const auth={Authorization:'Bearer '+process.env.STRIPE_TEST_SECRET_KEY};
    const [sessionResponse, customerResponse] = await Promise.all([
      fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(session.id),{headers:auth}),
      session.customer ? fetch('https://api.stripe.com/v1/customers/'+encodeURIComponent(session.customer),{headers:auth}) : null
    ]);
    if(!sessionResponse.ok || !customerResponse?.ok)throw new Error('Stripe canonical lookup failed');
    const checkout=await sessionResponse.json(), customer=await customerResponse.json();
    if(checkout.payment_status!=='paid' || checkout.amount_total!==3900 || checkout.currency!=='eur' ||
       checkout.metadata?.event_key!=='frattali_2026_10' || checkout.customer!==customer.id) {
      return res.status(200).json({received:true,ignored:true});
    }
    const email=(customer.email||checkout.customer_details?.email||'').trim().toLowerCase();
    if(customer.id!==allowedCustomerId) {
      console.error('Paid test session outside CourseSprout allowlist',session.id);
      return res.status(503).json({error:'Test buyer not allowed for CourseSprout enrollment'});
    }
    const names=(customer.name||checkout.customer_details?.name||'').trim().split(/\s+/).filter(Boolean);
    if(names.length<2)throw new Error('Buyer first and last name not available');
    // Legacy Selen skill: GET /api/ai/get-members; POST /api/ai/add-user with pricing_option_id.
    const base='https://api.coursesprout.com/api/ai/';
    const headers={'X-API-KEY':apiKey,Accept:'application/json','Content-Type':'application/json'};
    const url=new URL(base+'get-members');
    url.searchParams.set('search',email);url.searchParams.set('type','course');
    url.searchParams.set('pricing_option_id','1222');
    const listResponse=await fetch(url,{headers});
    if(!listResponse.ok)throw new Error('CourseSprout member lookup failed: '+listResponse.status);
    const roster=await listResponse.json();
    if(roster.status===false)throw new Error('CourseSprout member lookup rejected');
    const items=Array.isArray(roster.data?.data)?roster.data.data:Array.isArray(roster.items)?roster.items:Array.isArray(roster.data)?roster.data:[];
    const hasAccess=items.some(item=>(item.email||item.user?.email||'').toLowerCase()===email);
    if(hasAccess)return res.status(200).json({received:true,alreadyEnrolled:true});
    // Add-user is UPSERT according to the archived CourseSprout API skill.
    // Never email a password or invoke a bulk reminder from this webhook.
    const enrolled=await fetch(base+'add-user',{method:'POST',headers,body:JSON.stringify({
      first_name:names[0],last_name:names.slice(1).join(' '),email,pricing_option_id:1222,
      password:crypto.randomBytes(24).toString('base64url')
    })});
    const result=await enrolled.json().catch(()=>null);
    if(!enrolled.ok || result?.status===false)throw new Error('CourseSprout enrollment failed: '+enrolled.status);
    // Do not infer enrollment from an add-user success: the API can create a member without granting the course.
    const verifyResponse=await fetch(url,{headers});
    if(!verifyResponse.ok)throw new Error('CourseSprout post-enrollment verification failed');
    const verified=await verifyResponse.json();
    const verifiedItems=Array.isArray(verified.data?.data)?verified.data.data:Array.isArray(verified.items)?verified.items:Array.isArray(verified.data)?verified.data:[];
    if(!verifiedItems.some(item=>(item.email||item.user?.email||'').toLowerCase()===email)) {
      throw new Error('CourseSprout member exists but course access was not assigned');
    }
    console.info('CourseSprout test course grant verified',session.id);
    return res.status(200).json({received:true,enrolled:true});
  }catch(error){
    console.error('CourseSprout test fulfillment failed:',error.message);
    return res.status(503).json({error:'Test enrollment failed; retry later'});
  }
}
