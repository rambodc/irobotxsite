import Decimal from "decimal.js";
import { getBalanceChanges } from "xrpl";
import { D, RLUSD, LIMITS } from "./config.js";
export { D, LIMITS };
export const RPC = "https://s1.ripple.com:51234/";
export const xrp = (drops) => D(drops).div(1e6);
export const drops = (value) => D(value).mul(1e6).floor().toFixed(0);
export const issued = (value) =>
  D(value).toSignificantDigits(16, Decimal.ROUND_DOWN).toString();
export function assertNetwork(info) {
  if (info.network_id !== 0)
    throw new Error(
      "Network mismatch: only XRPL Mainnet (network ID 0) is allowed.",
    );
}
export async function rpc(method, params = {}) {
  const pinnedRead =
    !!params.ledger_hash &&
    ["ledger", "account_info", "account_lines", "book_offers"].includes(method);
  // Retry the identical validated snapshot only. Never retry submissions here,
  // or substitute a different ledger underneath balance and price checks.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: [{ ...params, api_version: 2 }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("Mainnet RPC unavailable.");
    const result = (await res.json()).result;
    if (result?.error) {
      const unavailable = ["ledgerNotFound", "lgrNotFound"].includes(
        result.error,
      );
      if (pinnedRead && unavailable && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      const e = new Error(
        pinnedRead && unavailable
          ? "The ledger server is temporarily missing this snapshot. Refresh and try again."
          : result.error_message || result.error,
      );
      e.code = result.error;
      e.result = result;
      throw e;
    }
    if (!result) throw new Error("Empty Mainnet RPC response.");
    return result;
  }
}
export async function ledger() {
  const { info } = await rpc("server_info");
  assertNetwork(info);
  const v = info.validated_ledger;
  const closed = await rpc("ledger", {
    ledger_hash: v.hash,
    transactions: false,
    expand: false,
  });
  if (!closed.validated) throw new Error("Ledger is not validated.");
  const at = (closed.ledger.close_time + 946684800) * 1000;
  if (
    !Number.isFinite(at) ||
    !v.hash ||
    !Number.isInteger(v.seq) ||
    Date.now() - at > 30000 ||
    at > Date.now() + 5000
  )
    throw new Error("Validated Mainnet ledger is stale.");
  return {
    hash: v.hash,
    index: v.seq,
    at,
    reserve: String(v.reserve_base_xrp),
    increment: String(v.reserve_inc_xrp),
    source: RPC,
    complete: info.complete_ledgers,
  };
}
export function issuerAllowed(a) {
  const flags = a.Flags >>> 0;
  if (flags & 0x40000 || flags & 0x400000)
    throw new Error("Issuer requires authorization or is globally frozen.");
  if (a.TransferRate && a.TransferRate !== 1000000000)
    throw new Error("Issuer transfer fees are not supported.");
}
export function levels(offers, side) {
  return offers
    .flatMap((o) => {
      const native = side === "ask" ? o.TakerGets : o.TakerPays,
        token = side === "ask" ? o.TakerPays : o.TakerGets;
      if (
        typeof native !== "string" ||
        !token ||
        token.currency !== RLUSD.currency ||
        token.issuer !== RLUSD.issuer
      )
        return [];
      const gets = o.taker_gets_funded ?? o.TakerGets,
        pays = o.taker_pays_funded ?? o.TakerPays;
      try {
        const q = xrp(side === "ask" ? gets : pays),
          v = D((side === "ask" ? pays : gets).value);
        if (!q.isFinite() || !v.isFinite() || q.lte(0) || v.lte(0)) return [];
        return [
          {
            price: v.div(q).toString(),
            quantity: q.toString(),
            value: v.toString(),
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => D(a.price).cmp(b.price) * (side === "ask" ? 1 : -1));
}
export function checkBook(m, cfg) {
  if (!m.asks.length || !m.bids.length)
    throw new Error("One-sided or unfunded XRP/RLUSD book.");
  const ask = D(m.asks[0].price),
    bid = D(m.bids[0].price);
  if (bid.gte(ask)) throw new Error("Crossed or locked order book.");
  const spread = ask.minus(bid).div(ask.plus(bid).div(2)).mul(100);
  const movement = D(cfg.movement).div(100);
  return {
    bid: bid.toString(),
    ask: ask.toString(),
    mid: ask.plus(bid).div(2).toString(),
    spread: spread.toString(),
    buyDepth: m.asks
      .filter((x) => D(x.price).lte(ask.mul(D(1).plus(movement))))
      .reduce((n, x) => n.plus(x.value), D(0))
      .toString(),
    sellDepth: m.bids
      .filter((x) => D(x.price).gte(bid.mul(D(1).minus(movement))))
      .reduce((n, x) => n.plus(x.quantity), D(0))
      .toString(),
    eligible: spread.lte(cfg.spread),
    reason: spread.lte(cfg.spread)
      ? "Validated funded XRP/RLUSD book."
      : "Spread exceeds the configured limit.",
  };
}
export async function book(header, cfg, address) {
  const [issuer, ask, bid] = await Promise.all([
    rpc("account_info", { account: RLUSD.issuer, ledger_hash: header.hash }),
    rpc("book_offers", {
      taker_gets: { currency: "XRP" },
      taker_pays: RLUSD,
      ledger_hash: header.hash,
      limit: 100,
      ...(address ? { taker: address } : {}),
    }),
    rpc("book_offers", {
      taker_gets: RLUSD,
      taker_pays: { currency: "XRP" },
      ledger_hash: header.hash,
      limit: 100,
      ...(address ? { taker: address } : {}),
    }),
  ]);
  issuerAllowed(issuer.account_data);
  for (const r of [ask, bid])
    if (r.ledger_hash !== header.hash || r.ledger_index !== header.index)
      throw new Error("Book ledger mismatch.");
  const m = {
    asks: levels(ask.offers, "ask"),
    bids: levels(bid.offers, "bid"),
    ledger: header.index,
    at: header.at,
    source: RPC,
    asset: RLUSD,
  };
  return { ...m, ...checkBook(m, cfg) };
}
export function trustLine(w) {
  const line = w.lines.find(
    (l) => l.currency === RLUSD.currency && l.account === RLUSD.issuer,
  );
  if (
    line &&
    (line.freeze ||
      line.freeze_peer ||
      line.deep_freeze ||
      line.deep_freeze_peer)
  )
    throw new Error("RLUSD trust line is frozen.");
  return line;
}
export async function wallet(address, header) {
  try {
    const [a, l] = await Promise.all([
      rpc("account_info", { account: address, ledger_hash: header.hash }),
      rpc("account_lines", {
        account: address,
        ledger_hash: header.hash,
        limit: 400,
        peer: RLUSD.issuer,
      }),
    ]);
    const reserve = D(header.reserve).plus(
      D(header.increment).mul(a.account_data.OwnerCount),
    );
    return {
      address,
      funded: true,
      balance: xrp(a.account_data.Balance).toString(),
      reserve: reserve.toString(),
      available: Decimal.max(
        0,
        xrp(a.account_data.Balance).minus(reserve),
      ).toString(),
      reserveIncrement: header.increment,
      sequence: a.account_data.Sequence,
      flags: a.account_data.Flags,
      lines: l.lines,
      ledger: header.index,
      at: header.at,
    };
  } catch (e) {
    if (e.code === "actNotFound")
      return {
        address,
        funded: false,
        balance: "0",
        available: "0",
        lines: [],
        reason:
          "Fund this Mainnet address with XRP before creating its RLUSD trust line.",
      };
    throw e;
  }
}
export function balanceGuard(w, amount, fee, extraReserve = "0") {
  if (!w.funded) throw new Error("Wallet requires Mainnet XRP funding.");
  if (D(fee).gt(LIMITS.feeDrops) || D(fee).lt(0))
    throw new Error("Transaction fee exceeds 0.01 XRP.");
  if (
    D(w.available)
      .minus(amount)
      .minus(xrp(fee))
      .minus(extraReserve)
      .lt(LIMITS.buffer)
  )
    throw new Error(
      "Insufficient XRP above ledger reserve and the 5 XRP buffer.",
    );
}
export function actualResult(response, address, asset) {
  if (!response.validated || typeof response.meta !== "object")
    throw new Error("Transaction is not validated.");
  const tx = response.tx_json || response;
  const balances =
    getBalanceChanges(response.meta).find((a) => a.account === address)
      ?.balances || [];
  const fee = xrp(tx.Fee).toString();
  const change = balances.find((b) => b.currency === "XRP")?.value || "0";
  const token =
    balances.find(
      (b) =>
        asset && b.currency === asset.currency && b.issuer === asset.issuer,
    )?.value || "0";
  return {
    result: response.meta.TransactionResult,
    fee,
    xrpChange: change,
    tradeXrp: D(change).plus(fee).toString(),
    tokenChange: token,
    executionPrice:
      D(token).eq(0) || D(change).plus(fee).eq(0)
        ? null
        : D(token).div(D(change).plus(fee)).abs().toString(),
    ledger: response.ledger_index,
    at: tx.date ? (tx.date + 946684800) * 1000 : Date.now(),
  };
}
export function covered(ranges, min, max) {
  return String(ranges)
    .split(",")
    .some((r) => {
      const [a, b] = r.split("-").map(Number);
      return a <= min && (b ?? a) >= max;
    });
}

export function ledgerFailure(code) {
  const explanations = {
    tecKILLED: "The order could not fill within its price limit.",
    tecUNFUNDED_OFFER:
      "The ledger rejected the order because spendable funds were insufficient.",
    tecFROZEN:
      "The ledger rejected the trade because the asset or trust line is frozen.",
    tecNO_AUTH: "The issuer has not authorized this account to hold the token.",
    tecNO_LINE: "The required trust line is missing.",
    tecINSUF_RESERVE_LINE:
      "There is insufficient XRP reserve for this trust line.",
    tecPATH_DRY: "No executable liquidity was available.",
  };
  return `${explanations[code] || "The ledger validated a failed transaction. Review its result before retrying."} (${code})`;
}
