import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
export async function GET(){const started=Date.now();try{await prisma.$queryRaw`SELECT 1`;return NextResponse.json({service:"logivya-db",status:"healthy",latencyMs:Date.now()-started})}catch{return NextResponse.json({service:"logivya-db",status:"unhealthy"},{status:503})}}
