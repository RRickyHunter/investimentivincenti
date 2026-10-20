// Server-side Checkout creation. TEST ONLY until the fulfillment webhook is complete.
// Bank transfers are deliberately disabled. Do not supply a live Stripe key.
const PRICE_ID = 'price_1URbv5Rjl8noNUUHyM8CecFC';
const DOMAIN = 'https://www.investimentivincenti.com';
async function stripe(path, key, data, method = 'POST') {
  const response = await fetch('https://api.stripe.com/v1/' + path, {
    method, headers: { Authorization: 'Bearer ' + key, ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: data ? new URLSearchParams(data).toString() : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'Stripe API error');
  return payload;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'POST') return res.status(405).json({error:'Metodo non consentito'});
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) return res.status(503).json({error:'Checkout di prova non configurato'});
  const { email, firstName, lastName } = req.body || {};
  if(typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName || !lastName)
    return res.status(400).json({error:'Inserisci nome, cognome e un indirizzo email valido'});
  const safeEmail = email.trim().toLowerCase().slice(0,254);
  const safeName = (String(firstName)+' '+String(lastName)).trim().slice(0,200);
  // One approved staging buyer; keep all other addresses away from real CourseSprout and AC.
  if(safeEmail !== 'riccardo.romano73+2@gmail.com') return res.status(403).json({error:'Checkout riservato al test autorizzato'});
  try {
    const lookup = await stripe('customers?'+new URLSearchParams({email:safeEmail,limit:'10'}),key,null,'GET');
    // An email address alone does not prove identity: test-only matching, review before production.
    let customer = lookup.data?.length === 1 ? lookup.data[0] : null;
    if(!customer) customer = await stripe('customers',key,{email:safeEmail,name:safeName,'metadata[event_key]':'frattali_2026_10'});
    const data = {
      mode:'payment',customer:customer.id,locale:'it',
      'adaptive_pricing[enabled]':'false',
      'line_items[0][price]':PRICE_ID,'line_items[0][quantity]':'1',
      'payment_method_types[0]':'card',
      success_url:DOMAIN+'/tyfrat/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:DOMAIN+'/ckoutfrat/',
      'metadata[event_key]':'frattali_2026_10',
      'metadata[environment]':'test',
      'client_reference_id': 'frattali_2026_10'
    };
    const session = await stripe('checkout/sessions',key,data);
    return res.status(200).json({url:session.url});
  } catch(e) {
    console.error('Checkout test failure',e.message);
    return res.status(502).json({error:'Non è stato possibile aprire il checkout di prova'});
  }
}