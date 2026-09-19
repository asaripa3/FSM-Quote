import { safeError, sameOrigin } from "@/lib/server/providers";
import { parseInspection } from "@/lib/server/input";
import { isTradeId } from "@/lib/trades";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:"Invalid request origin."},{status:403});
  let body;
  try {body=await request.json();} catch {return Response.json({error:"Invalid job request."},{status:400});}
  if (!body || !isTradeId(body.trade) || typeof body.note!=="string" || body.note.trim().length<12 || body.note.length>12000) return Response.json({error:"Add a field note between 12 and 12,000 characters."},{status:400});
  try {return Response.json(await parseInspection(body.trade,body.note,request.signal));}
  catch(error){return Response.json({error:safeError(error)},{status:502});}
}
