import { D, day } from "./config.js";
export function averages(samples, now = Date.now()) {
  const s = samples.slice(-60);
  if (s.length !== 60 || now - s.at(-1).at > 90000) return null;
  for (let i = 0; i < s.length; i++)
    if (
      !D(s[i].mid).isFinite() ||
      D(s[i].mid).lte(0) ||
      (i && s[i].slot !== s[i - 1].slot + 1)
    )
      return null;
  const mean = (a) => a.reduce((n, x) => n.plus(x.mid), D(0)).div(a.length);
  return { fast: mean(s.slice(-20)), slow: mean(s), mid: D(s.at(-1).mid) };
}
export function equity(position, bid) {
  return D(position.realized)
    .plus(D(position.quantity).mul(bid))
    .minus(position.cost);
}
export function evaluate(c, samples, market, now = Date.now()) {
  const a = averages(samples, now),
    p = c.position,
    q = D(p.quantity),
    cfg = c.settings;
  const mark = equity(p, market.bid).minus(
    q.gt(0) ? D("0.01").mul(market.ask) : 0,
  );
  const baseline = c.daily.day === day(now) ? D(c.daily.baseline) : mark;
  const loss = mark.minus(baseline);
  if (c.daily.stoppedDay === day(now) || loss.lte(D(cfg.dailyLoss).neg()))
    return {
      action: q.gt(0) ? "SELL" : "STOP",
      reason: "Daily loss stop reached.",
      dailyStop: true,
    };
  if (q.gt(0)) {
    const net = q.mul(market.bid).minus(D("0.01").mul(market.ask));
    const pct = D(p.cost).gt(0) ? net.minus(p.cost).div(p.cost).mul(100) : D(0);
    if (pct.lte(D(cfg.stopLoss).neg()))
      return { action: "SELL", reason: "Position loss threshold reached." };
    if (pct.gte(cfg.takeProfit))
      return { action: "SELL", reason: "Profit target reached." };
    if (a && a.fast.lte(a.slow))
      return {
        action: "SELL",
        reason: "20-minute trend reversed below the 60-minute average.",
      };
    return { action: "WAIT", reason: "Holding; no exit threshold reached." };
  }
  if (!a)
    return {
      action: "WAIT",
      reason: "Warming up: 60 consecutive one-minute samples required.",
    };
  if (now < c.cooldownUntil)
    return {
      action: "WAIT",
      reason: "20-minute cooldown after the last exit.",
    };
  if (a.fast.gte(a.slow.mul("1.0015")) && a.mid.gt(a.fast))
    return {
      action: "BUY",
      reason:
        "Positive 20/60-minute trend; AI approval and execution limits still required.",
    };
  return { action: "WAIT", reason: "Entry trend conditions are not met." };
}
export function approvalValid(a, c, now = Date.now()) {
  return (
    !!a &&
    a.verdict === "allow" &&
    !a.usedBy &&
    a.expiresAt > now &&
    !!c.news &&
    a.newsAt === c.news.at &&
    now - c.news.at <= c.settings.newsMinutes * 60000 + 60000 &&
    a.revision === c.revision &&
    a.pair === c.settings.pair &&
    a.positionKey === `${c.position.quantity}:${c.position.cost}`
  );
}
export function accountFill(position, action, result) {
  const p = { ...position },
    fee = D(result.fee),
    feeQuote = fee.mul(result.markPrice);
  if (!["buy", "sell"].includes(action)) {
    p.setupFees = D(p.setupFees).plus(fee).toString();
    return p;
  }
  p.tradingFees = D(p.tradingFees).plus(fee).toString();
  const qty = D(result.tradeXrp),
    quote = D(result.tokenChange);
  if (action === "buy" && qty.gt(0) && quote.lt(0)) {
    if (D(p.quantity).gt(0)) throw new Error("Unexpected additional buy fill.");
    p.quantity = qty.toString();
    p.cost = quote.neg().plus(feeQuote).toString();
  } else if (action === "sell" && qty.lt(0) && quote.gt(0)) {
    const sold = qty.neg(),
      old = D(p.quantity);
    if (sold.gt(old)) throw new Error("Fill exceeds tracked position.");
    const cost = D(p.cost).mul(sold.div(old));
    p.quantity = old.minus(sold).toString();
    p.cost = D(p.cost).minus(cost).toString();
    p.realized = D(p.realized)
      .plus(quote)
      .minus(cost)
      .minus(feeQuote)
      .toString();
  } else p.realized = D(p.realized).minus(feeQuote).toString();
  return p;
}
