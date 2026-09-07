// Preloaded only by the subprocess integration test. No real DNS or HTTP is
// needed by these fixtures; abort rather than let the resolver swallow a mock error.
import { promises as dns } from "node:dns";

function forbidden() {
  process.stderr.write("FORBIDDEN_TRACKING_NETWORK\n");
  process.exit(97);
}

dns.resolveTxt = forbidden;
dns.resolveCname = forbidden;
globalThis.fetch = forbidden;
