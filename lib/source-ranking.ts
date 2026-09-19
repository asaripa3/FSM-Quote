import type { Constraint, SourceOption } from "./job";
import { evidenceOnPage, normalizeUnits as normalized } from "./sourcing";
export function checkSpecifications(constraints: Constraint[], specs: unknown, text: string) {
  const values = Array.isArray(specs) ? specs as {field?:string;value?:string;evidence?:string}[] : [];
  const conflicts: string[] = [], missing: string[] = [];
  for (const expected of constraints) {
    const actual = values.find(s=>typeof s.field==="string" && normalized(s.field)===normalized(expected.field) && typeof s.value==="string" && typeof s.evidence==="string" && evidenceOnPage(s.evidence,text) && normalized(s.evidence).includes(normalized(s.value)));
    if(!actual) missing.push(`Confirm ${expected.field}: ${expected.value}`);
    else if(normalized(actual.value!)!==normalized(expected.value)) conflicts.push(`${expected.field}: job requires ${expected.value}; page states ${actual.value}`);
  }
  return {conflicts,missing};
}
export function rankSuppliers(sources: SourceOption[], preferred: string[] = []) {
  const identity = (s:SourceOption)=>s.matchStatus==="rejected"?2:s.matchStatus==="exact"?0:1;
  const stock = (s:SourceOption)=>/out of stock|unavailable|back.?order/i.test(s.availability)?2:/\bin stock\b|available now/i.test(s.availabilityEvidence||"")?0:1;
  const preference = (s:SourceOption)=>{const i=preferred.findIndex(d=>s.domain===d||s.domain.endsWith(`.${d}`));return i<0?preferred.length:i;};
  return [...sources].sort((a,b)=>identity(a)-identity(b)||stock(a)-stock(b)||preference(a)-preference(b)
    || (a.currency===b.currency && a.packQuantity!=null && a.packQuantity===b.packQuantity && a.price!==null && b.price!==null ? a.price-b.price : 0))
    .map(s=>({...s,rankReason:s.matchStatus==="rejected"?"Conflicting specification — excluded from estimate":s.matchStatus!=="exact"?"Identity or fit checks need review":stock(s)===0?"Exact identifier and page-supported availability":"Exact identifier; confirm remaining fit and delivery details"}));
}
