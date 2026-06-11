import { NextResponse } from "next/server";
import { messageQueue } from "@/server/queues/client";
export async function GET(){try{const queue=messageQueue(),counts=await queue.getJobCounts("waiting","active","delayed","failed");await queue.close();return NextResponse.json({service:"logivya-queue",status:"healthy",counts})}catch{return NextResponse.json({service:"logivya-queue",status:"unhealthy"},{status:503})}}
