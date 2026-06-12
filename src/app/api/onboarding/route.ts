import { NextResponse } from "next/server";import { requireApiSession } from "@/server/auth/session";import { syncOnboarding } from "@/server/onboarding/service";
export async function GET(){try{const{company}=await requireApiSession();return NextResponse.json({onboarding:await syncOnboarding(company.id)})}catch{return NextResponse.json({error:"UNAUTHORIZED"},{status:401})}}
export async function PATCH(){return GET()}
