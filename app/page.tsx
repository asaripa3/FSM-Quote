import Link from "next/link";
import Image from "next/image";
import { Nav, Footer } from "@/components/shell";
import { FieldWorld } from "@/components/field-world";
import { TRADE_LIST } from "@/lib/trades";
export default function Home() {
  return <><Nav /><main className="landing"><FieldWorld />
    <section className="simple-story page-width" id="why"><p className="eyebrow">THE EQUIPMENT IS NEW TO YOU. THE ANSWER ISN’T.</p><h2>You don’t need a quote yet.<br /><span>You need to know what you’re looking at.</span></h2><p>The manual, the fault code, the wiring diagram and the right replacement are all on the open web, spread across manufacturer portals, PDFs, distributor pages and forums. Finding them means leaving the job.</p>
    <div className="simple-steps"><article><span>01 / CAPTURE</span><h3>Say what you’re seeing.</h3><p>Speak it, upload the recording, or type it. Uncertainty is fine, it is the point.</p><div className="step-example">“Fault code 31. Inducer runs.<br />Not sure if it’s the switch.”</div></article><article><span>02 / RESEARCH</span><h3>Exa reads the equipment.</h3><p>OEM manuals, service bulletins, wiring diagrams and technician knowledge, gathered for this machine and this fault.</p><div className="step-example">What the evidence says.<br />What to check first.</div></article><article><span>03 / CONFIRM</span><h3>You make the call.</h3><p>Run the checks the documentation asks for. Nothing is sourced or priced until you say what you found.</p><div className="step-example">“Draft is normal.<br />Switch failed continuity.”</div></article><article><span>04 / ACT</span><h3>Then it sources and quotes.</h3><p>The OEM part, its supersession, suppliers and public prices. Your labour rate and markup finish the estimate.</p><div className="step-example">Part + evidence + your rates.<br />Ready to send.</div></article></div></section>
    <section className="simple-start" id="packs"><div className="page-width"><div><p className="eyebrow">YOUR NEXT JOB</p><h2>What are we fixing?</h2><p>Choose your trade. Bring your own note.</p></div><div className="start-trades">{TRADE_LIST.map(t => <Link href={`/workflow/${t.id}`} key={t.id}><Image src={t.mascot} alt="" width={t.mascotW} height={t.mascotH} unoptimized /><strong>{t.name}</strong><span>Start a job ↗</span></Link>)}</div></div></section>
  </main><Footer /></>;
}
