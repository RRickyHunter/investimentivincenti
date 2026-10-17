// TEMPORARY, test Customer only. Remove after verifying the CourseSprout API end to end.
import {grantFrattali} from './lib/coursesprout-frattali.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).end();
 if(!process.env.STRIPE_TEST_SECRET_KEY?.startsWith('sk_test_') || !process.env.COURSESPROUT_API_KEY)return res.status(503).json({ok:false,reason:'env missing'});
 const sid='cs_test_a1qv6XkKbFkmHaYRKgu68Q9Bw4rfT6FUhu788i6XwKSjnmskw4dgbZFS9F';
 const response=await fetch('https://api.stripe.com/v1/checkout/sessions/'+sid,{headers:{Authorization:'Bearer '+process.env.STRIPE_TEST_SECRET_KEY}});
 if(!response.ok)return res.status(502).json({ok:false,reason:'stripe lookup failed',status:response.status});
 const s=await response.json();
 if(s.payment_status!=='paid'||s.amount_total!==3900||s.currency!=='eur'||s.customer!=='cus_VSY4i3mC8ZrV2d')return res.status(403).json({ok:false});
 try{
 const result=await grantFrattali({email:'ciccius@batocchius.it',firstName:'Ciccius',lastName:'Batocchius',key:process.env.COURSESPROUT_API_KEY});
 return res.status(200).json({ok:true,...result});
 }catch(e){console.error('COURSESPROUT_E2E_CHECK',e.message);return res.status(503).json({ok:false,reason:e.message});}
}