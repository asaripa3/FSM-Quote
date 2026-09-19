import { safeError, sameOrigin } from "@/lib/server/providers";
import { searchProducts } from "@/lib/server/product-search";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
 if (!sameOrigin(request)) return Response.json({error:"Invalid request origin."},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:"Invalid search request."},{status:400});}
 if(!body||typeof body.query!=="string"||body.query.length<4||body.query.length>600) return Response.json({error:"Enter a part description or SKU to search."},{status:400});
 if(body.constraints!==undefined && (!Array.isArray(body.constraints)||body.constraints.length>8||body.constraints.some((c:Record<string,unknown>)=>!c||typeof c.field!=="string"||typeof c.value!=="string"))) return Response.json({error:"Invalid part specifications."},{status:400});
 try{return Response.json(await searchProducts(body,request.signal));}catch(error){return Response.json({error:safeError(error)},{status:502});}
}
