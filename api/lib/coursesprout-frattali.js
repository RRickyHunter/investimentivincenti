// CourseSprout Agent API adapter. Keeps existing grants when updating a member.
const ROOT='https://api.coursesprout.com/api';
const COURSE=681, OFFER=1222;
async function request(path,key,method='GET',body){
 const response=await fetch(ROOT+path,{method,headers:{'X-API-KEY':key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json().catch(()=>null);
 if(!response.ok || json?.status===false) {
   if(response.status===404 || (method==='GET' && json?.message==='Data not found.'))return null;
   throw new Error('CourseSprout request '+path+' failed with '+response.status);
 }
 return json?.data??json;
}
const norm=s=>(s||'').toString().trim().toLowerCase();
const memberUser=m=>m?.user||m;
export function hasFrattaliAccess(m){
 const courses=memberUser(m)?.courses;
 return Array.isArray(courses)&&courses.some(x=>Number(x.id||x.course_id)===COURSE && Number(x.pivot?.pricing_option_id||x.option_id)===OFFER);
}
function preserve(m){
 const u=memberUser(m);
 const courses=Array.isArray(u.courses)?u.courses.map(x=>({course_id:Number(x.id||x.course_id),...(x.pivot?.pricing_option_id||x.option_id?{option_id:Number(x.pivot?.pricing_option_id||x.option_id)}:{})})):[];
 if(!courses.some(x=>x.course_id===COURSE))courses.push({course_id:COURSE,option_id:OFFER});
 const membershipRows=u.memberships;
 if(!Array.isArray(membershipRows))throw new Error('CourseSprout current membership state incomplete');
 const memberships=membershipRows.map(x=>({membership_id:Number(x.id||x.membership_id),full_access:Boolean(x.pivot?.full_access??x.full_access)}));
 const rawOptions=u.pricing_options??u.pricingOptions;
 const pricing_options={};
 if(Array.isArray(rawOptions))for(const x of rawOptions)pricing_options[String(x.id||x.pricing_option_id)] = x.membership_id||x.pivot?.membership_id?{membership_id:Number(x.membership_id||x.pivot?.membership_id)}:{};
 else if(rawOptions && typeof rawOptions==='object') for(const [id,entry] of Object.entries(rawOptions))pricing_options[id]=entry;
 else if(memberships.length)throw new Error('CourseSprout pricing options missing for member with memberships');
 const rawExtras=u.extra_course_ids||u.extraCourses||{};
 const extra_course_ids={};
 if(!Array.isArray(rawExtras) && rawExtras && typeof rawExtras==='object')for(const [k,v] of Object.entries(rawExtras))extra_course_ids[k]=Array.isArray(v)?v.map(Number):[];
 else if(memberships.length)throw new Error('CourseSprout extra courses missing for member with memberships');
 return {courses,memberships,pricing_options,extra_course_ids};
}
export async function grantFrattali({email,firstName,lastName,key}){
 const current=await request('/member/get/'+encodeURIComponent(email),key);
 if(current && norm(memberUser(current)?.email)!==norm(email))throw new Error('CourseSprout member identity mismatch');
 if(hasFrattaliAccess(current))return {alreadyEnrolled:true};
 if(current){
   const id=Number(current.id||current.user_account_id);
   if(!Number.isSafeInteger(id)||id<=0)throw new Error('CourseSprout member id unavailable');
   await request('/member/update-access',key,'POST',{id,...preserve(current)});
 }else{
   await request('/member/add',key,'POST',{email,first_name:firstName,last_name:lastName,courses:[{course_id:COURSE,option_id:OFFER}],memberships:[],pricing_options:{},extra_course_ids:{}});
 }
 const after=await request('/member/get/'+encodeURIComponent(email),key);
 if(!hasFrattaliAccess(after))throw new Error('CourseSprout course grant not confirmed');
 return {enrolled:true};
}
