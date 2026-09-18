/**
 * Q4, answered directly: what breaks if you swap Exa for a search engine.
 * Framed as the three things this workflow needs that a keyword index does
 * not return — semantic resolution, live page content as structured fields,
 * and scoping to a buyable supplier set.
 */
export function WhyNotSearch() {
  return (
    <section className="versus page-width" id="versus">
      <div className="versus-head">
        <div>
          <p className="eyebrow">
            <span /> THE HONEST QUESTION
          </p>
          <h2>
            &ldquo;Couldn&rsquo;t you just
            <br />
            use a search engine?&rdquo;
          </h2>
        </div>
        <p>
          The technician never says a part number. The part number changes. The price changes. A
          keyword index answers a different question than the one this workflow asks — so here is
          the same job, run both ways.
        </p>
      </div>

      <div className="versus-grid">
        <article className="versus-col is-old">
          <header>
            <span className="micro-label">A SEARCH ENGINE</span>
            <code>sloan royal 111 diaphragm</code>
          </header>
          <ul>
            <li>
              <strong>2.4M results</strong> ranked for shoppers, not for an estimator who needs one
              correct SKU.
            </li>
            <li>
              <strong>Links, not content.</strong> Price and compatibility live inside the page, so
              a human still opens every tab.
            </li>
            <li>
              <strong>No answer on fit.</strong> &ldquo;Does this work on a Royal 111?&rdquo; is a
              forum thread, not a field.
            </li>
            <li>
              <strong>Legacy numbers go stale silently.</strong> The 3301150 on the work order
              still pulls reseller listings. Nothing tells you Sloan now catalogues that kit as
              3301070.
            </li>
            <li>
              <strong>Nothing to scope.</strong> Marketplace resellers rank alongside the two
              distributors procurement actually approved.
            </li>
          </ul>
          <footer className="versus-cost">
            <span>{" "}8 tabs · 3 catalogs · ~22 min</span>
          </footer>
        </article>

        <article className="versus-col is-new">
          <header>
            <span className="micro-label">EXA, INSIDE THE WORKFLOW</span>
            <code>&ldquo;the diaphragm inside the Royal 111 looks worn&rdquo;</code>
          </header>
          <ul>
            <li>
              <strong>Field language resolves to a product.</strong> Semantic retrieval turns the
              technician&rsquo;s own sentence into <em>Sloan A-1101-A</em> — no SKU required.
            </li>
            <li>
              <strong>Page content comes back with the result.</strong> Price and currency arrive as
              structured fields with highlights, in the same call — nothing to scrape.
            </li>
            <li>
              <strong>Fit is evidenced.</strong> A second retrieval returns the manufacturer passage
              that states compatibility, with its URL.
            </li>
            <li>
              <strong>Supersession is discoverable.</strong> The live web knows that kit is
              catalogued as 3301070 today. Your ERP still has 3301150.
            </li>
            <li>
              <strong>Scoped to what you can buy.</strong> Retrieval is constrained to the trade
              pack&rsquo;s approved domains.
            </li>
          </ul>
          <footer className="versus-cost is-win">
            <span>10 sources · 6 retrievals · seconds</span>
          </footer>
        </article>
      </div>

      <div className="versus-proof">
        <span className="micro-label">THE PART THAT CANNOT BE FAKED</span>
        <div className="proof-chain">
          <span className="proof-old">3301150</span>
          <i>legacy number → catalogued today as</i>
          <strong>3301070</strong>
        </div>
        <p>
          Your ERP knows what you bought three years ago. Exa finds what supersedes it today — and
          the manufacturer page that says so. Order against the stale number and you are trusting
          whatever a reseller still has on a shelf.
        </p>
      </div>
    </section>
  );
}
