// Live checkout, intentionally fail-closed until Stripe live credentials are configured.
const DOMAIN='https://www.investimentivincenti.com';
const PRICE='price_1USkpmRjl8noNUUHCoRsdmZq';
async function stripe(path,key,data,method='POST'){
 const r=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+key,...(data?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(data?{body:new URLSearchParams(data).toString()}:{})});
 const j=await r.json();if(!r.ok)throw Error('Stripe API '+r.status);return j;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Metodo non consentito'});
 const key=process.env.STRIPE_LIVE_SECRET_KEY;
 if(process.env.FRATTALI_LIVE_ENABLED!=='true'||!key?.startsWith('sk_live_')||!process.env.STRIPE_LIVE_WEBHOOK_SECRET?.startsWith('whsec_'))
  return res.status(503).json({error:'Vendite non ancora abilitate'});
 const {email,firstName,lastName}=req.body||{};
 if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!String(firstName||'').trim()||!String(lastName||'').trim())
  return res.status(400).json({error:'Inserisci nome, cognome e email validi'});
 const cleanEmail=email.trim().toLowerCase().slice(0,254);
 try{
  const session=await stripe('checkout/sessions',key,{
    mode:'payment',locale:'it','adaptive_pricing[enabled]':'false',
    'line_items[0][price]':PRICE,'line_items[0][quantity]':'1','payment_method_types[0]':'card',
    customer_email:cleanEmail,
    success_url:DOMAIN+'/tyfrat/?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:DOMAIN+'/ckoutfrat-live/',
    'metadata[event_key]':'frattali_2026_10','metadata[environment]':'live',
    'metadata[first_name]':String(firstName).trim().slice(0,100),
    'metadata[last_name]':String(lastName).trim().slice(0,100)
  });
  return res.status(200).json({url:session.url});
 }catch(e){console.error('Live checkout session creation failed:',e.message);return res.status(502).json({error:'Checkout temporaneamente non disponibile'});}
}
