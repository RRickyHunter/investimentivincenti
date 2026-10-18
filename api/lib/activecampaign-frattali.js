// ActiveCampaign API v3: idempotent contact-tag assignment.
// Called only after Stripe payment and CourseSprout grant verification.
const TAG='ES-Acquisto-Frattali10-26';
async function ac(path,method='GET',data){
 const base=process.env.ACTIVECAMPAIGN_API_URL?.replace(/\/+$/,'').replace(/\/api\/3$/,'');
 const token=process.env.ACTIVECAMPAIGN_API_KEY;
 if(!base||!token)throw Error('ActiveCampaign not configured');
 const r=await fetch(base+'/api/3'+path,{method,headers:{'Api-Token':token,'Content-Type':'application/json',Accept:'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const json=await r.json().catch(()=>({}));
 if(!r.ok)throw Error('ActiveCampaign '+path+' HTTP '+r.status);
 return json;
}
export async function tagPurchase({email,firstName,lastName}){
 const found=await ac('/tags?search='+encodeURIComponent(TAG)+'&limit=100');
 const tags=found.tags||[];
 const tag=tags.find(x=>x.tag===TAG);
 if(!tag)throw Error('Purchase tag missing in ActiveCampaign: '+TAG);
 const sync=await ac('/contact/sync','POST',{contact:{email,firstName,lastName}});
 const contact=sync.contact;
 if(!contact?.id)throw Error('ActiveCampaign contact sync returned no id');
 const current=await ac('/contacts/'+contact.id+'/contactTags?limit=100');
 if((current.contactTags||[]).some(x=>String(x.tag)===String(tag.id)))return {alreadyTagged:true};
 await ac('/contactTags','POST',{contactTag:{contact:String(contact.id),tag:String(tag.id)}});
 return {tagged:true};
}
