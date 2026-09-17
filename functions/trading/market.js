import { bookLevels } from "./engine.js";
const SERVERS = [
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];
const rpcAsset = ({ currency, issuer }) => ({
  currency,
  ...(issuer ? { issuer } : {}),
});
async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("XRPL feed is unavailable.");
  const { result } = await response.json();
  if (!result || result.error || result.status === "error")
    throw new Error("XRPL rejected the market request.");
  return result;
}
export async function readMarkets(pairs) {
  let url, header;
  for (const server of SERVERS) {
    try {
      header = await rpc(server, "ledger", {
        ledger_index: "validated",
        transactions: false,
        expand: false,
      });
      url = server;
      break;
    } catch {
      /* Try the other fixed public server. */
    }
  }
  if (!header || header.validated !== true)
    throw new Error("No validated XRPL ledger is available.");
  const ledger = Number(header.ledger_index),
    at = (Number(header.ledger.close_time) + 946684800) * 1000;
  if (
    !Number.isSafeInteger(ledger) ||
    !Number.isFinite(at) ||
    Date.now() - at > 30000 ||
    at > Date.now() + 5000
  )
    throw new Error("The XRPL feed is stale.");
  return Promise.all(
    pairs.map(async (pair) => {
      try {
        const [ask, bid] = await Promise.all([
          rpc(url, "book_offers", {
            ledger_index: ledger,
            taker_gets: rpcAsset(pair.base),
            taker_pays: rpcAsset(pair.quote),
            limit: 50,
          }),
          rpc(url, "book_offers", {
            ledger_index: ledger,
            taker_gets: rpcAsset(pair.quote),
            taker_pays: rpcAsset(pair.base),
            limit: 50,
          }),
        ]);
        if (
          ask.ledger_hash !== header.ledger_hash ||
          bid.ledger_hash !== header.ledger_hash ||
          Number(ask.ledger_index) !== ledger ||
          Number(bid.ledger_index) !== ledger
        )
          throw new Error("Order books do not share a validated ledger.");
        const asks = bookLevels(ask.offers || [], pair, "ask"),
          bids = bookLevels(bid.offers || [], pair, "bid");
        return {
          pairId: pair.id,
          at,
          ledger,
          ask: asks[0]?.price || "0",
          bid: bids[0]?.price || "0",
          asks,
          bids,
        };
      } catch {
        return {
          pairId: pair.id,
          error: "Unable to read this pair from the validated ledger.",
        };
      }
    }),
  );
}
