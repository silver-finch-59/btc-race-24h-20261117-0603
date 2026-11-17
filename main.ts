// Tidehunter — a cbBTC/USDC trend bot for agent-fun/bars-replay/v1.
//
// Idea: on the 1-minute chart BTC trends in bursts and the noise between
// bursts is tiny (a few bps a minute), while a full round trip costs ~26 bps
// in fees, slippage and pool impact. So this bot is deliberately lazy: it
// buys the first real sign of an uptrend, then holds it with a wide trailing
// stop and otherwise does nothing. Every extra trade is a tax; the bot only
// pays it when the trend has genuinely turned against it.
//
// Entry (flat only): a fresh 12-minute high with the 12-minute return above
// 5 bps — early enough to catch the drift, strict enough to skip flat noise.
// Exit (long only): the close falls 250 bps below the best close since
// entry (trailing stop), or 300 bps below the entry close (hard stop). A
// 60-bar cooldown after every exit keeps it from churning in a whipsaw.
//
// The wide stops are the point: in the dev window the biggest adverse swing
// is about 210 bps, so the bot rides the whole drift like a holder; in a
// window that falls hard, the stops cut the loss at ~3% instead of riding
// it to the bottom. No shorts, no leverage, no wall clock, no network, no
// randomness at all. All arithmetic is integer (bigint) basis points off
// the closes, so the bot is deterministic and independent of the symbol's
// price scale.

import { runBars, type BarsState, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Slippage cap on every order: fills pay ~2 bps modelled slippage plus
// ~7 bps of pool impact on a full-size trade, so 200 bps is wide open
// against normal 1-minute moves and only bites on a genuine gap.
const MAX_SLIPPAGE_BPS = 200;

// --- tuning knobs (all in basis points unless noted) ---
const FAST_WINDOW = 12; // minutes for the trend reading and the fresh-high window
const ENTER_FAST_MIN = 5; // 12-minute return must be at least this strong to enter
const TRAIL_STOP_BPS = 250; // sell when the close falls this far below the peak since entry
const HARD_STOP_BPS = 300; // sell when the close falls this far below the entry close
const COOLDOWN_BARS = 60; // bars to wait after an exit before re-entering

/** Basis points of (a - b) / b, truncated toward zero. */
function bps(a: bigint, b: bigint): bigint {
  return ((a - b) * 10000n) / b;
}

interface TideState {
  closes: bigint[];
  entryClose: bigint | null;
  peakClose: bigint;
  cooldownUntil: number;
}

const st: TideState = { closes: [], entryClose: null, peakClose: 0n, cooldownUntil: -1 };

await runBars({
  onBatch(state: BarsState): OrderInput[] {
    if (state.warmingUp) return [];
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return []; // no bar for CBBTC this minute: decide nothing
    const close = BigInt(bar.c);
    st.closes.push(close);
    const n = st.closes.length;

    const pos = state.positions.get(SYMBOL);
    const holding = pos !== undefined && pos.qty > 0n;

    if (holding) {
      if (st.entryClose === null) st.entryClose = close;
      if (close > st.peakClose) st.peakClose = close;
      const belowTrail = bps(close, st.peakClose) <= -BigInt(TRAIL_STOP_BPS);
      const belowHard = bps(close, st.entryClose) <= -BigInt(HARD_STOP_BPS);
      if (belowTrail || belowHard) {
        st.entryClose = null;
        st.peakClose = 0n;
        st.cooldownUntil = n + COOLDOWN_BARS;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: look for the first sign of an uptrend.
    if (n <= FAST_WINDOW || n <= st.cooldownUntil) return [];
    const fast = bps(close, st.closes[n - 1 - FAST_WINDOW]!);
    if (fast < BigInt(ENTER_FAST_MIN)) return [];
    let hi = st.closes[n - 1 - FAST_WINDOW]!;
    for (let k = n - FAST_WINDOW; k < n; k++) {
      if (st.closes[k]! > hi) hi = st.closes[k]!;
    }
    if (close < hi) return [];

    const room = state.weightRoom(SYMBOL);
    const size = state.cash < room ? state.cash : room;
    if (size <= 0n) return [];
    st.entryClose = close;
    st.peakClose = close;
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
