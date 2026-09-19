import { safeError, sameOrigin } from "@/lib/server/providers";
import { discoverParts } from "@/lib/server/discovery";
import { isTradeId } from "@/lib/trades";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
 if (!sameOrigin(request)) return Response.json({error:"Invalid request origin."},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:"Invalid job request."},{status:400});}
 if(!body || !isTradeId(body.trade)||!Array.isArray(body.parts)||!body.parts.length||body.parts.length>12) return Response.json({error:"Nothing to research on this job."},{status:400});
 const parts=body.parts.filter((p:Record<string,unknown>)=>p&&typeof p.id==="string"&&typeof p.description==="string").map((p:Record<string,unknown>)=>({id:String(p.id).slice(0,60),description:String(p.description).slice(0,300),equipment:String(p.equipment||"").slice(0,300),sku:String(p.sku||"").slice(0,100)}));
 try{return Response.json(await discoverParts(parts,request.signal));}catch(error){return Response.json({error:safeError(error)},{status:502});}
}
