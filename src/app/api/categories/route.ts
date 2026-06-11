import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

const schema = z.object({ name: z.string().min(2).max(80), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#f97316"), groupIds: z.array(z.string()).default([]) });
export async function POST(request: Request) {
  try {
    const { company } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const validGroups = await prisma.whatsAppGroup.findMany({ where: { companyId: company.id, id: { in: parsed.data.groupIds } }, select: { id: true } });
    const category = await prisma.category.create({ data: { companyId: company.id, name: parsed.data.name, color: parsed.data.color, groups: { create: validGroups.map((group) => ({ groupId: group.id })) } } });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 400 }); }
}
