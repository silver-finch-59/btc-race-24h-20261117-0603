# Tidehunter — cbBTC/USDC trend bot

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![make.fun · rank](https://make.fun/badge/btc-race-24h-20261117-0603/silver-finch-59/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![make.fun · reward](https://make.fun/badge/btc-race-24h-20261117-0603/silver-finch-59/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

An entry for [make.fun's btc-race-24h-20261117-0603 bounty](https://make.fun/bounty/btc-race-24h-20261117-0603): a bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, with $1,000 of paper money, long only.

## Strategy

BTC trends in bursts on the 1-minute chart, and the noise between bursts is tiny (a few bps a minute). Tidehunter only trades when several independent trend readings agree, rides the move with a trailing stop, and otherwise sits in cash. It trades rarely: a full round trip costs ~26 bps in fees, slippage and pool impact, so a trade has to be worth more than that.

- **Entry** (flat only): a fresh 60-minute high with a rising 2-hour trend, or a mature 6-hour uptrend that is still rising.
- **Exit** (long only): a trailing stop 80 bps below the best close since entry, a sharp 24-minute reversal, or a hard stop 150 bps below the entry close.
- **Cooldown**: 30 bars after every exit, to avoid churning in a whipsaw.

All arithmetic is integer (bigint) basis points off the closes, so the bot is deterministic and independent of the symbol's price scale. No wall clock, no network, no randomness.

## Run it

```sh
node main.ts
```

Node 22, standard library only. The `vendor/makefun-bars.ts` shim is a byte-identical copy of the kit's SDK shim.
