import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { createAccessToken } from "../src/server/mobile/auth";
if (process.env.LOGIVYA_ISOLATED_TEST !== "1" || new URL(process.env.DATABASE_URL!).hostname !== "astra-expiration-db") throw new Error("ISOLATED_DATABASE_REQUIRED");
const base="http://astra-api-web:3000";
const results: string[]=[];
async function fixture(name:string) {
  const user=await prisma.user.create({data:{name:`Synthetic ${name}`,email:`security-${name}@example.invalid`,username:`security-${name}`,passwordHash:"unusable"}});
  const company=await prisma.company.create({data:{name:`Synthetic ${name}`,ownerId:user.id,mfaPolicy:"NONE"}});
  const membership=await prisma.companyUser.create({data:{companyId:company.id,userId:user.id,role:"OWNER",lifecycleState:"INDEPENDENT_OWNER"}});
  const session=await prisma.mobileDeviceSession.create({data:{companyId:company.id,userId:user.id,deviceId:`synthetic-${name}`,refreshTokenHash:`synthetic-hash-${name}`,expiresAt:new Date(Date.now()+3600000)}});
  const category=await prisma.category.create({data:{companyId:company.id,name:`Private ${name}`,color:"#ff7900"}});
  const token=createAccessToken({userId:user.id,companyId:company.id,sessionId:session.id,role:"OWNER"}).accessToken;
  return {user,company,membership,session,category,token};
}
async function call(path:string,token?:string,method="GET",body?:unknown) {
  const r=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  return {status:r.status,body:await r.json()};
}
async function main(){
 const a=await fixture("alpha");const b=await fixture("beta");
 const own=await call("/api/mobile/auth/me",a.token);assert.equal(own.status,200);assert.equal(own.body.data.user.id,a.user.id);results.push("legitimate-session");
 const categories=await call("/api/mobile/categories",a.token);assert.equal(categories.status,200);assert.deepEqual(categories.body.data.categories.map((x:{id:string})=>x.id),[a.category.id]);results.push("cross-tenant-list-isolation");
 const edit=await call(`/api/mobile/categories/${b.category.id}`,a.token,"PATCH",{name:"Injected cross-tenant edit"});assert.equal(edit.status,404);results.push("cross-tenant-update-denied");
 const removal=await call(`/api/mobile/categories/${b.category.id}`,a.token,"DELETE");assert.equal(removal.status,404);results.push("cross-tenant-delete-denied");
 const retained=await prisma.category.findUniqueOrThrow({where:{id:b.category.id}});assert.equal(retained.name,"Private beta");assert.equal(retained.archivedAt,null);
 const ownEdit=await call(`/api/mobile/categories/${a.category.id}`,a.token,"PATCH",{name:"Legitimate edit"});assert.equal(ownEdit.status,200);results.push("legitimate-update-preserved");
 const wrongTenant=createAccessToken({userId:a.user.id,companyId:b.company.id,sessionId:a.session.id,role:"OWNER"}).accessToken;
 assert.equal((await call("/api/mobile/auth/me",wrongTenant)).status,401);results.push("token-session-company-mismatch-denied");
 const wrongUser=createAccessToken({userId:b.user.id,companyId:a.company.id,sessionId:a.session.id,role:"OWNER"}).accessToken;
 assert.equal((await call("/api/mobile/auth/me",wrongUser)).status,401);results.push("token-session-user-mismatch-denied");
 const admin=await call("/api/admin/users",a.token);assert.ok([401,403].includes(admin.status));results.push("workspace-owner-is-not-platform-admin");
 await prisma.companyUser.update({where:{id:a.membership.id},data:{role:"VIEWER"}});
 assert.equal((await call(`/api/mobile/categories/${a.category.id}`,a.token,"PATCH",{name:"Stale OWNER claim"})).status,403);results.push("stale-role-escalation-denied");
 await prisma.mobileDeviceSession.update({where:{id:a.session.id},data:{revokedAt:new Date()}});
 assert.equal((await call("/api/mobile/auth/me",a.token)).status,401);results.push("revoked-session-denied");
 console.log(JSON.stringify({ok:true,isolated:true,productionDataUsed:false,externalNetworkAvailable:false,results}));
}
main().finally(()=>prisma.$disconnect());
