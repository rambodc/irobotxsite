import Decimal from "decimal.js";
import { isValidClassicAddress, getBalanceChanges } from "xrpl";
export const D = (v) => new Decimal(v);
export const RPC = "https://s.altnet.rippletest.net:51234/";
export const LIMITS = Object.freeze({
  purchase: "1",
  daily: "10",
  buffer: "5",
  feeDrops: 10000,
  spread: "0.01",
  movement: "0.005",
  cycles: 3,
  attempts: 5,
  duration: 600000,
});
export const xrp = (drops) => D(drops).div(1e6);
export const drops = (value) => D(value).mul(1e6).floor().toFixed(0);
export const issued = (value) =>
  D(value).toSignificantDigits(16, Decimal.ROUND_DOWN).toString();
export function assetValid(a) {
  return (
    a &&
    /^(?!XRP$)([A-Za-z0-9]{3}|[A-F0-9]{40})$/.test(a.currency) &&
    isValidClassicAddress(a.issuer)
  );
}
export function symbol(currency) {
  if (currency.length === 3) return currency;
  const text = Buffer.from(currency, "hex").toString("utf8").replace(/\0/g, "");
  return /^[\w .-]{1,20}$/.test(text) ? text : currency.slice(0, 10);
}
export function assertNetwork(info) {
  if (info.network_id !== 1)
    throw new Error(
      "Network mismatch: only XRPL Testnet (network ID 1) is allowed.",
    );
}
export async function rpc(method, params = {}) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [{ ...params, api_version: 2 }] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Testnet RPC unavailable.");
  const result = (await res.json()).result;
  if (result?.error) {
    const e = new Error(result.error_message || result.error);
    e.code = result.error;
    e.result = result;
    throw e;
  }
  if (!result) throw new Error("Empty Testnet RPC response.");
  return result;
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
    throw new Error("Validated Testnet ledger is stale.");
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
  if (flags & 0x40000 || flags & 0x400000 || flags & 0x80000000)
    throw new Error(
      "Issuer requires authorization, permits clawback, or is globally frozen.",
    );
  if (a.TransferRate && a.TransferRate !== 1000000000)
    throw new Error("Issuer transfer fees are not supported.");
}
export function levels(offers, side, asset) {
  return offers
    .flatMap((o) => {
      if (
        side === "ask"
          ? typeof o.TakerGets !== "object" ||
            o.TakerGets.currency !== asset.currency ||
            o.TakerGets.issuer !== asset.issuer ||
            typeof o.TakerPays !== "string"
          : typeof o.TakerPays !== "object" ||
            o.TakerPays.currency !== asset.currency ||
            o.TakerPays.issuer !== asset.issuer ||
            typeof o.TakerGets !== "string"
      )
        return [];
      const gets = o.taker_gets_funded ?? o.TakerGets,
        pays = o.taker_pays_funded ?? o.TakerPays;
      const quantity = D(side === "ask" ? gets.value : pays.value),
        value = xrp(side === "ask" ? pays : gets);
      if (
        !quantity.isFinite() ||
        !value.isFinite() ||
        quantity.lte(0) ||
        value.lte(0)
      )
        return [];
      return [
        {
          price: value.div(quantity).toString(),
          quantity: quantity.toString(),
          xrp: value.toString(),
        },
      ];
    })
    .sort((a, b) => D(a.price).cmp(b.price) * (side === "ask" ? 1 : -1));
}
export function checkBook(book, sellQuantity = null) {
  const { asks, bids } = book;
  if (!asks.length || !bids.length)
    throw new Error(
      "No eligible market available: one-sided or unfunded book.",
    );
  const ask = D(asks[0].price),
    bid = D(bids[0].price);
  if (bid.gt(ask)) throw new Error("Crossed order book.");
  const spread = ask.minus(bid).div(ask.plus(bid).div(2));
  if (spread.gt(LIMITS.spread)) throw new Error("Spread exceeds 1%.");
  const askCap = ask.mul(1.005),
    bidFloor = bid.mul(0.995);
  const buyDepth = asks
    .filter((l) => D(l.price).lte(askCap))
    .reduce((n, l) => n.plus(l.xrp), D(0));
  const sellDepth = bids
    .filter((l) => D(l.price).gte(bidFloor))
    .reduce((n, l) => n.plus(l.quantity), D(0));
  const needed = sellQuantity ? D(sellQuantity) : D(1).div(ask);
  if (buyDepth.lt(1) || sellDepth.lt(needed))
    throw new Error("Insufficient funded liquidity within the price limit.");
  return {
    bid: bid.toString(),
    ask: ask.toString(),
    spread: spread.mul(100).toString(),
    buyDepth: buyDepth.toString(),
    sellDepth: sellDepth.toString(),
  };
}
export async function book(asset, header, sellQuantity) {
  if (!assetValid(asset)) throw new Error("Invalid token currency or issuer.");
  const [issuer, ask, bid] = await Promise.all([
    rpc("account_info", { account: asset.issuer, ledger_hash: header.hash }),
    rpc("book_offers", {
      taker_gets: asset,
      taker_pays: { currency: "XRP" },
      ledger_hash: header.hash,
      limit: 100,
    }),
    rpc("book_offers", {
      taker_gets: { currency: "XRP" },
      taker_pays: asset,
      ledger_hash: header.hash,
      limit: 100,
    }),
  ]);
  issuerAllowed(issuer.account_data);
  for (const r of [ask, bid])
    if (r.ledger_hash !== header.hash || r.ledger_index !== header.index)
      throw new Error("Book ledger mismatch.");
  const result = {
    asset,
    symbol: symbol(asset.currency),
    asks: levels(ask.offers, "ask", asset),
    bids: levels(bid.offers, "bid", asset),
    ledger: header.index,
    at: header.at,
    source: RPC,
  };
  return {
    ...result,
    ...checkBook(result, sellQuantity),
    eligible: true,
    reason:
      "Funded two-sided Testnet book; issuer and execution limits passed.",
  };
}
export async function wallet(address, header) {
  try {
    const [a, l] = await Promise.all([
      rpc("account_info", { account: address, ledger_hash: header.hash }),
      rpc("account_lines", {
        account: address,
        ledger_hash: header.hash,
        limit: 400,
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
      sequence: a.account_data.Sequence,
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
          "Account not found on Testnet. A network reset may require re-funding the same address.",
      };
    throw e;
  }
}
export function balanceGuard(w, amount, fee, extraReserve = "0") {
  if (!w.funded) throw new Error("Wallet requires Testnet faucet funding.");
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
    executionPrice: D(token).eq(0)
      ? null
      : D(change).plus(fee).div(token).abs().toString(),
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
