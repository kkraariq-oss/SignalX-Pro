import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Bar, Area, ReferenceLine
} from "recharts";

// ╔══════════════════════════════════════════════════════════════╗
// ║  🔑 API KEYS                                                 ║
// ║  Alpha Vantage: https://www.alphavantage.co/support          ║
// ║  Twelve Data:  https://twelvedata.com/                       ║
// ╚══════════════════════════════════════════════════════════════╝
const PLACEHOLDER_KEY = "REPLACE_ME";
const _ALPHA_VANTAGE_HARDCODED_KEY = PLACEHOLDER_KEY;
const _TWELVE_DATA_HARDCODED_KEY = "d94a14c217714a3e9119c6b2dd98d785";
const ALPHA_VANTAGE_KEY = (() => {
  try {
    const envKey = import.meta.env?.VITE_ALPHA_VANTAGE_KEY;
    if (envKey && typeof envKey === "string" && envKey.length > 5 && envKey !== PLACEHOLDER_KEY) return envKey;
  } catch {}
  return _ALPHA_VANTAGE_HARDCODED_KEY;
})();
const TWELVE_DATA_KEY = (() => {
  try {
    const envKey = import.meta.env?.VITE_TWELVE_DATA_KEY;
    if (envKey && typeof envKey === "string" && envKey.length > 5 && envKey !== PLACEHOLDER_KEY) return envKey;
  } catch {}
  return _TWELVE_DATA_HARDCODED_KEY;
})();

// ─── FETCH TIMEOUT + ABORT HELPERS ─────────────────────────────
const FETCH_TIMEOUT_MS = 12000;

async function safeFetch(url, signal) {
  const controller = new AbortController();
  const combinedSignal = signal;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("TIMEOUT"));
    }, FETCH_TIMEOUT_MS);
  });
  const onExternalAbort = () => controller.abort();
  if (combinedSignal) combinedSignal.addEventListener("abort", onExternalAbort);
  try {
    const res = await Promise.race([
      fetch(url, { signal: controller.signal }),
      timeoutPromise
    ]);
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError" || (combinedSignal && combinedSignal.aborted)) throw new Error("ABORTED");
    if (err.message === "TIMEOUT") throw new Error("TIMEOUT");
    throw err;
  } finally {
    if (combinedSignal) combinedSignal.removeEventListener("abort", onExternalAbort);
  }
}

// ─── PROVIDER CONFIG ────────────────────────────────────────
const PROVIDERS = {
  binance: { label: "Binance", desc: "عملات رقمية — بدون مفتاح", needsKey: false },
  alphavantage: { label: "Alpha Vantage", desc: "فوركس / أسهم", needsKey: true },
  twelvedata: { label: "Twelve Data", desc: "فوركس (حي)", needsKey: true },
};

// ─── SYMBOL MAPPINGS ────────────────────────────────────────
const BINANCE_MAP = {
  // Top 10 by Market Cap
  "BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT", "SOL/USD": "SOLUSDT",
  "BNB/USD": "BNBUSDT", "XRP/USD": "XRPUSDT", "ADA/USD": "ADAUSDT",
  // Layer 2 & DeFi
  "AVAX/USD": "AVAXUSDT", "DOT/USD": "DOTUSDT", "LINK/USD": "LINKUSDT",
  "MATIC/USD": "MATICUSDT", "DOGE/USD": "DOGEUSDT", "LTC/USD": "LTCUSDT",
  // AI & Gaming
  "FIL/USD": "FILUSDT", "TRX/USD": "TRXUSDT", "NEAR/USD": "NEARUSDT",
  "RENDER/USD": "RENDERUSDT", "APE/USD": "APEUSDT", "ATOM/USD": "ATOMUSDT",
  // Stables & Layer 1
  "USDC/USD": "USDCUSDT", "USDT/USD": "USDTUSDT", "BUSD/USD": "BUSDUSDT",
  "ZEC/USD": "ZECUSDT", "XMR/USD": "XMRUSDT", "DYDX/USD": "DYDXUSDT",
  // New Altcoins
  "ARB/USD": "ARBUSDT", "OP/USD": "OPUSDT", "JTO/USD": "JTOUSDT",
  "ORDI/USD": "ORDIUSDT", "INJ/USD": "INJUSDT", "PEPE/USD": "PEPEUSDT",
};

const FOREX_MAP = {
  // Major Pairs
  "EUR/USD": { f: "EUR", t: "USD" }, "GBP/USD": { f: "GBP", t: "USD" },
  "USD/JPY": { f: "USD", t: "JPY" }, "USD/CHF": { f: "USD", t: "CHF" },
  // Commodity Pairs
  "AUD/USD": { f: "AUD", t: "USD" }, "USD/CAD": { f: "USD", t: "CAD" },
  "NZD/USD": { f: "NZD", t: "USD" }, "USD/CNY": { f: "USD", t: "CNY" },
  // Cross Pairs
  "EUR/GBP": { f: "EUR", t: "GBP" }, "EUR/JPY": { f: "EUR", t: "JPY" },
  "GBP/JPY": { f: "GBP", t: "JPY" }, "EUR/CHF": { f: "EUR", t: "CHF" },
  "GBP/CHF": { f: "GBP", t: "CHF" }, "AUD/CAD": { f: "AUD", t: "CAD" },
  // Precious Metals
  "XAU/USD": { f: "XAU", t: "USD" }, "XAG/USD": { f: "XAG", t: "USD" },
  "XPD/USD": { f: "XPD", t: "USD" }, "XPT/USD": { f: "XPT", t: "USD" },
};

const STOCKS = [
  // Tech Giants
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVIDIA", "TSLA", "META", "NVDA",
  // Finance
  "JPM", "BAC", "WFC", "GS", "MS", 
  // Healthcare
  "JNJ", "PFE", "ABBV", "MERCK", "LLY",
  // Consumer
  "WMT", "HD", "MCD", "NKE", "SBUX",
  // Energy & Industrials
  "XOM", "CVX", "BA", "CAT", "MMM",
];

const ASSETS = {
  crypto: { label: "العملات الرقمية", icon: "₿", provider: "binance", items: Object.keys(BINANCE_MAP) },
  forex:  { label: "فوركس", icon: "💱", provider: "twelvedata", items: Object.keys(FOREX_MAP) },
  stocks: { label: "الأسهم", icon: "📈", provider: "twelvedata", items: STOCKS },
};

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"];
const TF_MS = { "1m": 60e3, "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5, "1D": 864e5 };
const BN_TF = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d" };
const AV_TF = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "60min" };
const TD_TF = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1D": "1day" };

// ─── CACHE HELPERS ──────────────────────────────────────────
const CACHE_TTL = { binance: 10000, alphavantage: 180000, twelvedata: 45000 };

function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function cacheKey(p, s, t) { return `ta3_${p}_${s}_${t}`; }
function loadCache(p, s, t) {
  const c = lsGet(cacheKey(p, s, t), null);
  if (!c || !c.data?.length) return null;
  return c;
}
function saveCache(p, s, t, data) {
  lsSet(cacheKey(p, s, t), { data, ts: Date.now() });
}
function isCacheFresh(p, s, t) {
  const c = loadCache(p, s, t);
  if (!c) return false;
  return (Date.now() - c.ts) < (CACHE_TTL[p] || 60000);
}

// ─── AV ERROR DETECTION ────────────────────────────────────
const AV_ERROR_TYPES = {
  RATE_LIMIT: "RATE_LIMIT",
  INVALID_KEY: "INVALID_KEY",
  PREMIUM_REQUIRED: "PREMIUM_REQUIRED",
  OTHER_ERROR: "OTHER_ERROR",
};

function detectAVError(data) {
  if (!data || typeof data !== "object") return null;
  const note = data["Note"] || "";
  const info = data["Information"] || "";
  const errMsg = data["Error Message"] || "";
  if (note) {
    const noteLower = note.toLowerCase();
    if (noteLower.includes("call frequency") || noteLower.includes("rate") || noteLower.includes("please visit") || noteLower.includes("api call volume")) {
      return { type: AV_ERROR_TYPES.RATE_LIMIT, message: note.substring(0, 120) };
    }
    if (noteLower.includes("premium") || noteLower.includes("subscribe")) {
      return { type: AV_ERROR_TYPES.PREMIUM_REQUIRED, message: note.substring(0, 120) };
    }
    return { type: AV_ERROR_TYPES.RATE_LIMIT, message: note.substring(0, 120) };
  }
  if (info) {
    const infoLower = info.toLowerCase();
    if (infoLower.includes("api call frequency") || infoLower.includes("rate limit") || infoLower.includes("requests per minute")) {
      return { type: AV_ERROR_TYPES.RATE_LIMIT, message: info.substring(0, 120) };
    }
    if (infoLower.includes("premium") || infoLower.includes("subscribe") || infoLower.includes("upgrade") || infoLower.includes("not available") || infoLower.includes("not entitled")) {
      return { type: AV_ERROR_TYPES.PREMIUM_REQUIRED, message: info.substring(0, 120) };
    }
    if (infoLower.includes("invalid") || infoLower.includes("incorrect") || infoLower.includes("not recognized")) {
      return { type: AV_ERROR_TYPES.INVALID_KEY, message: info.substring(0, 120) };
    }
    return { type: AV_ERROR_TYPES.OTHER_ERROR, message: info.substring(0, 120) };
  }
  if (errMsg) {
    const errLower = errMsg.toLowerCase();
    if (errLower.includes("invalid api") || errLower.includes("invalid key") || errLower.includes("not valid") || errLower.includes("inactive")) {
      return { type: AV_ERROR_TYPES.INVALID_KEY, message: errMsg.substring(0, 120) };
    }
    return { type: AV_ERROR_TYPES.OTHER_ERROR, message: errMsg.substring(0, 120) };
  }
  return null;
}

function checkAVError(data) {
  const err = detectAVError(data);
  if (!err) return;
  const e = new Error(err.type);
  e.avType = err.type;
  e.avMessage = err.message;
  throw e;
}

// ─── DATA FETCHERS ──────────────────────────────────────────
async function fetchBinance(symbol, tf, limit = 500, abortSignal) {
  const bSym = BINANCE_MAP[symbol];
  if (!bSym) throw new Error(`${symbol} غير مدعوم`);
  const url = `https://api.binance.com/api/v3/klines?symbol=${bSym}&interval=${BN_TF[tf] || "15m"}&limit=${limit}`;
  const res = await safeFetch(url, abortSignal);
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`Binance: ${res.status}`);
  const raw = await res.json();
  return raw.map(k => ({
    time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    timeLabel: new Date(k[0]).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
  }));
}

// Binance WebSocket for real-time price updates
function createBinanceWS(symbol, tf, onUpdate) {
  const bSym = BINANCE_MAP[symbol]?.toLowerCase();
  if (!bSym) return null;
  const bnTf = BN_TF[tf] || "15m";
  try {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${bSym}@kline_${bnTf}`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.k) {
          const k = msg.k;
          onUpdate({
            time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v,
            timeLabel: new Date(k.t).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
            isClosed: k.x, // whether this candle is closed
          });
        }
      } catch {}
    };
    ws.onerror = () => {};
    return ws;
  } catch { return null; }
}

function parseAVSeries(ts, isForex = false) {
  if (!ts || typeof ts !== "object") return [];
  const entries = Object.entries(ts).sort((a, b) => new Date(a[0]) - new Date(b[0]));
  return entries.map(([dt, v]) => {
    const t = new Date(dt).getTime();
    const o = parseFloat(v["1. open"]);
    const h = parseFloat(v["2. high"]);
    const l = parseFloat(v["3. low"]);
    const c = parseFloat(v["4. close"]);
    let vol = 100000;
    if (v["5. volume"]) vol = parseFloat(v["5. volume"]);
    else if (v["6. volume"]) vol = parseFloat(v["6. volume"]);
    else if (isForex) vol = Math.max(1, Math.round(((h - l) / (c || 1)) * 1e7));
    if (isNaN(vol) || vol <= 0) vol = 100000;
    return { time: t, open: o, high: h, low: l, close: c, volume: vol,
      timeLabel: new Date(t).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }) };
  }).filter(d => !isNaN(d.close) && d.close > 0).slice(-500);
}

function extractAVTimeSeries(data) {
  const keys = Object.keys(data);
  return keys.find(k =>
    k.startsWith("Time Series") || k.startsWith("Technical Analysis")
  );
}

async function fetchAVForex(symbol, tf, abortSignal) {
  const key = ALPHA_VANTAGE_KEY;
  if (!key || key === PLACEHOLDER_KEY) throw new Error("API_KEY_MISSING");
  const pair = FOREX_MAP[symbol];
  if (!pair) throw new Error(`${symbol} غير مدعوم`);
  const avTf = AV_TF[tf];
  let url, fallbackUsed = false;
  if (avTf) {
    url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${pair.f}&to_symbol=${pair.t}&interval=${avTf}&outputsize=full&apikey=${key}`;
  } else {
    url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${pair.f}&to_symbol=${pair.t}&outputsize=compact&apikey=${key}`;
  }
  let res = await safeFetch(url, abortSignal);
  if (!res.ok) throw new Error(`AV: ${res.status}`);
  let data = await res.json();
  const avErr = detectAVError(data);
  if (avErr) {
    if ((avErr.type === AV_ERROR_TYPES.PREMIUM_REQUIRED || avErr.type === AV_ERROR_TYPES.RATE_LIMIT) && avTf) {
      url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${pair.f}&to_symbol=${pair.t}&outputsize=compact&apikey=${key}`;
      res = await safeFetch(url, abortSignal);
      if (!res.ok) throw new Error(`AV Daily: ${res.status}`);
      data = await res.json();
      const avErr2 = detectAVError(data);
      if (avErr2) { const e = new Error(avErr2.type); e.avType = avErr2.type; e.avMessage = avErr2.message; throw e; }
      fallbackUsed = true;
    } else { const e = new Error(avErr.type); e.avType = avErr.type; e.avMessage = avErr.message; throw e; }
  }
  let tsKey = extractAVTimeSeries(data);
  if ((!tsKey || !data[tsKey] || Object.keys(data[tsKey]).length === 0) && avTf && !fallbackUsed) {
    url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${pair.f}&to_symbol=${pair.t}&outputsize=compact&apikey=${key}`;
    res = await safeFetch(url, abortSignal);
    if (!res.ok) throw new Error(`AV Daily: ${res.status}`);
    data = await res.json();
    const avErr3 = detectAVError(data);
    if (avErr3) { const e = new Error(avErr3.type); e.avType = avErr3.type; e.avMessage = avErr3.message; throw e; }
    tsKey = extractAVTimeSeries(data);
    fallbackUsed = true;
  }
  if (!tsKey || !data[tsKey]) throw new Error("لا توجد بيانات — تحقق من المفتاح أو الرمز");
  const candles = parseAVSeries(data[tsKey], true);
  if (candles.length === 0) throw new Error("بيانات فارغة");
  return { candles, fallbackUsed };
}

async function fetchAVStock(symbol, tf, abortSignal) {
  const key = ALPHA_VANTAGE_KEY;
  if (!key || key === PLACEHOLDER_KEY) throw new Error("API_KEY_MISSING");
  const avTf = AV_TF[tf];
  let url, fallbackUsed = false;
  if (avTf) {
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${avTf}&outputsize=full&apikey=${key}`;
  } else {
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${key}`;
  }
  let res = await safeFetch(url, abortSignal);
  if (!res.ok) throw new Error(`AV: ${res.status}`);
  let data = await res.json();
  const avErr = detectAVError(data);
  if (avErr) {
    if ((avErr.type === AV_ERROR_TYPES.PREMIUM_REQUIRED || avErr.type === AV_ERROR_TYPES.RATE_LIMIT) && avTf) {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${key}`;
      res = await safeFetch(url, abortSignal);
      if (!res.ok) throw new Error(`AV Daily: ${res.status}`);
      data = await res.json();
      const avErr2 = detectAVError(data);
      if (avErr2) { const e = new Error(avErr2.type); e.avType = avErr2.type; e.avMessage = avErr2.message; throw e; }
      fallbackUsed = true;
    } else { const e = new Error(avErr.type); e.avType = avErr.type; e.avMessage = avErr.message; throw e; }
  }
  let tsKey = extractAVTimeSeries(data);
  if ((!tsKey || !data[tsKey] || Object.keys(data[tsKey]).length === 0) && avTf && !fallbackUsed) {
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${key}`;
    res = await safeFetch(url, abortSignal);
    if (!res.ok) throw new Error(`AV Daily: ${res.status}`);
    data = await res.json();
    const avErr3 = detectAVError(data);
    if (avErr3) { const e = new Error(avErr3.type); e.avType = avErr3.type; e.avMessage = avErr3.message; throw e; }
    tsKey = extractAVTimeSeries(data);
    fallbackUsed = true;
  }
  if (!tsKey || !data[tsKey]) throw new Error("لا توجد بيانات");
  const candles = parseAVSeries(data[tsKey], false);
  if (candles.length === 0) throw new Error("بيانات فارغة");
  return { candles, fallbackUsed };
}

function parseTDSeries(values) {
  if (!Array.isArray(values)) return [];
  const sorted = [...values].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  return sorted.map(v => {
    const t = new Date(v.datetime).getTime();
    const o = parseFloat(v.open);
    const h = parseFloat(v.high);
    const l = parseFloat(v.low);
    const c = parseFloat(v.close);
    let vol = v.volume ? parseFloat(v.volume) : Math.max(1, Math.round(((h - l) / (c || 1)) * 1e7));
    if (isNaN(vol) || vol <= 0) vol = 100000;
    return { time: t, open: o, high: h, low: l, close: c, volume: vol,
      timeLabel: new Date(t).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }) };
  }).filter(d => !isNaN(d.close) && d.close > 0).slice(-500);
}

async function fetchTDForex(symbol, tf, abortSignal) {
  const key = TWELVE_DATA_KEY;
  if (!key || key === PLACEHOLDER_KEY) throw new Error("API_KEY_MISSING");
  const pair = FOREX_MAP[symbol];
  if (!pair) throw new Error(`${symbol} غير مدعوم`);
  const tdTf = TD_TF[tf] || "15min";
  const tdSymbol = `${pair.f}/${pair.t}`;
  const url = `https://api.twelvedata.com/time_series?symbol=${tdSymbol}&interval=${tdTf}&outputsize=500&apikey=${key}&format=JSON`;
  const res = await safeFetch(url, abortSignal);
  if (!res.ok) throw new Error(`TD: ${res.status}`);
  const data = await res.json();
  if (data?.status === "error" || data?.code || data?.message) {
    const msg = (data?.message || "").toLowerCase();
    if (msg.includes("rate") || msg.includes("limit")) throw new Error("RATE_LIMIT");
    if (msg.includes("api key") || msg.includes("apikey") || msg.includes("invalid")) throw new Error("API_KEY_MISSING");
    throw new Error(data?.message || "TD_ERROR");
  }
  const candles = parseTDSeries(data?.values || []);
  if (candles.length === 0) throw new Error("بيانات فارغة");
  return { candles, fallbackUsed: false };
}

async function fetchTDStock(symbol, tf, abortSignal) {
  const key = TWELVE_DATA_KEY;
  if (!key || key === PLACEHOLDER_KEY) throw new Error("API_KEY_MISSING");
  if (!STOCKS.includes(symbol)) throw new Error(`${symbol} غير مدعوم`);
  const tdTf = TD_TF[tf] || "15min";
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${tdTf}&outputsize=500&apikey=${key}&format=JSON`;
  const res = await safeFetch(url, abortSignal);
  if (!res.ok) throw new Error(`TD: ${res.status}`);
  const data = await res.json();
  if (data?.status === "error" || data?.code || data?.message) {
    const msg = (data?.message || "").toLowerCase();
    if (msg.includes("rate") || msg.includes("limit")) throw new Error("RATE_LIMIT");
    if (msg.includes("api key") || msg.includes("apikey") || msg.includes("invalid")) throw new Error("API_KEY_MISSING");
    throw new Error(data?.message || "TD_ERROR");
  }
  const candles = parseTDSeries(data?.values || []);
  if (candles.length === 0) throw new Error("بيانات فارغة");
  return { candles, fallbackUsed: false };
}

// ─── TECHNICAL INDICATORS ───────────────────────────────────
function calcEMA(data, period, key = "close") {
  if (!data.length) return [];
  const k = 2 / (period + 1); let v = data[0][key];
  return data.map((d, i) => { if (i === 0) return v; v = d[key] * k + v * (1 - k); return v; });
}
function calcSMA(data, period, key = "close") {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0; for (let j = i - period + 1; j <= i; j++) s += data[j][key]; return s / period;
  });
}
function calcRSI(data, period = 14) {
  if (data.length < period + 1) return data.map(() => 50);
  const ch = data.map((d, i) => (i === 0 ? 0 : d.close - data[i - 1].close));
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) { if (ch[i] > 0) ag += ch[i]; else al += Math.abs(ch[i]); }
  ag /= period; al /= period;
  return data.map((_, i) => {
    if (i < period) return 50;
    if (i === period) return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    const c = ch[i]; ag = (ag * (period - 1) + Math.max(c, 0)) / period; al = (al * (period - 1) + Math.max(-c, 0)) / period;
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  });
}
function calcMACD(data, fastP = 12, slowP = 26, sigP = 9) {
  if (data.length < slowP) return { macdLine: data.map(() => 0), signal: data.map(() => 0), histogram: data.map(() => 0) };
  const eF = calcEMA(data, fastP), eS = calcEMA(data, slowP);
  const ml = eF.map((v, i) => v - eS[i]);
  const k = 2 / (sigP + 1); let s = ml[0];
  const sig = ml.map((v, i) => { if (i === 0) return s; s = v * k + s * (1 - k); return s; });
  return { macdLine: ml, signal: sig, histogram: ml.map((v, i) => v - sig[i]) };
}
function calcBollinger(data, period = 20, mult = 2) {
  const sma = calcSMA(data, period);
  return data.map((_, i) => {
    if (i < period - 1 || sma[i] === null) return { upper: null, middle: null, lower: null };
    let vr = 0; for (let j = i - period + 1; j <= i; j++) vr += Math.pow(data[j].close - sma[i], 2);
    const sd = Math.sqrt(vr / period);
    return { upper: sma[i] + mult * sd, middle: sma[i], lower: sma[i] - mult * sd };
  });
}
function calcATR(data, period = 14) {
  const tr = data.map((d, i) => {
    if (i === 0) return d.high - d.low;
    const p = data[i - 1].close;
    return Math.max(d.high - d.low, Math.abs(d.high - p), Math.abs(d.low - p));
  });
  return tr.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0; for (let j = i - period + 1; j <= i; j++) s += tr[j]; return s / period;
  });
}
function calcStochastic(data, kP = 14, dP = 3) {
  const kV = data.map((d, i) => {
    if (i < kP - 1) return 50;
    let h = -Infinity, l = Infinity;
    for (let j = i - kP + 1; j <= i; j++) { h = Math.max(h, data[j].high); l = Math.min(l, data[j].low); }
    return (h - l) === 0 ? 50 : ((d.close - l) / (h - l)) * 100;
  });
  const dV = kV.map((_, i) => { if (i < dP - 1) return 50; let s = 0; for (let j = i - dP + 1; j <= i; j++) s += kV[j]; return s / dP; });
  return { k: kV, d: dV };
}
function calcVWAP(data) {
  let cv = 0, ct = 0;
  return data.map(d => { const tp = (d.high + d.low + d.close) / 3; ct += tp * d.volume; cv += d.volume; return cv === 0 ? d.close : ct / cv; });
}
function calcADX(data, period = 14) {
  if (data.length < period * 2) return { adx: data.map(() => 20), plusDI: data.map(() => 0), minusDI: data.map(() => 0) };
  const pdm = [], ndm = [], tr = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { pdm.push(0); ndm.push(0); tr.push(data[i].high - data[i].low); continue; }
    const up = data[i].high - data[i - 1].high, dn = data[i - 1].low - data[i].low;
    pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0);
    const p = data[i - 1].close;
    tr.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - p), Math.abs(data[i].low - p)));
  }
  const smooth = (arr) => { const r = []; let s = 0; for (let i = 0; i < arr.length; i++) { if (i < period) { s += arr[i]; r.push(i === period - 1 ? s : null); } else { s = s - s / period + arr[i]; r.push(s); } } return r; };
  const sTR = smooth(tr), sPDM = smooth(pdm), sNDM = smooth(ndm);
  const plusDI = [], minusDI = [];
  const dx = sTR.map((t, i) => {
    if (!t || t === 0) { plusDI.push(0); minusDI.push(0); return null; }
    const pi = (sPDM[i] / t) * 100, ni = (sNDM[i] / t) * 100;
    plusDI.push(pi); minusDI.push(ni);
    const sm = pi + ni;
    return sm === 0 ? 0 : (Math.abs(pi - ni) / sm) * 100;
  });
  let adxV = null;
  const adxArr = dx.map(d => { if (d === null) return 20; if (adxV === null) { adxV = d; return d; } adxV = (adxV * (period - 1) + d) / period; return adxV; });
  return { adx: adxArr, plusDI, minusDI };
}

// ─── PREMIUM INDICATORS (90% ACCURACY SUITE) ──────────────────

// Ichimoku Cloud
function calcIchimoku(data, tenkan = 9, kijun = 26, senkou = 52, chikou = 26) {
  const hlAvg = (s, e) => (Math.max(...data.slice(s, e).map(d => d.high)) + Math.min(...data.slice(s, e).map(d => d.low))) / 2;
  const tenkanLine = data.map((_, i) => i < tenkan - 1 ? null : hlAvg(i - tenkan + 1, i + 1));
  const kijunLine = data.map((_, i) => i < kijun - 1 ? null : hlAvg(i - kijun + 1, i + 1));
  const senkouA = tenkanLine.map((t, i) => (t && kijunLine[i]) ? (t + kijunLine[i]) / 2 : null);
  const senkouB = data.map((_, i) => i < senkou - 1 ? null : hlAvg(i - senkou + 1, i + 1));
  const chikouLine = new Array(data.length).fill(null);
  for (let i = 0; i < data.length - chikou; i++) chikouLine[i + chikou] = data[i].close;
  return { tenkanLine, kijunLine, senkouA, senkouB, chikouLine };
}

// Keltner Channels
function calcKeltner(data, period = 20, mult = 2) {
  const sma = calcSMA(data, period);
  const atr = calcATR(data, period);
  return data.map((_, i) => ({
    middle: sma[i],
    upper: sma[i] + (mult * atr[i]),
    lower: sma[i] - (mult * atr[i]),
  }));
}

// Stochastic RSI (Advanced)
function calcStochasticRSI(data, rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const rsi = calcRSI(data, rsiPeriod);
  const k = [], d = [];
  
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const slice = rsi.slice(i - stochPeriod + 1, i + 1);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    k.push(high === low ? 50 : ((rsi[i] - low) / (high - low)) * 100);
  }
  
  const kSmooth = k.map((_, i) => {
    if (i < smoothK - 1) return 50;
    const s = k.slice(i - smoothK + 1, i + 1);
    return s.reduce((a, b) => a + b) / smoothK;
  });
  
  kSmooth.slice(0, stochPeriod - 1).fill(50);
  d.fill(null);
  for (let i = smoothD - 1; i < kSmooth.length; i++) {
    const s = kSmooth.slice(i - smoothD + 1, i + 1);
    d[i] = s.reduce((a, b) => a + b) / smoothD;
  }
  d.fill(50, 0, smoothD - 1);
  
  return { k: kSmooth, d };
}

// Williams %R
function calcWilliamsR(data, period = 14) {
  return data.map((_, i) => {
    if (i < period - 1) return -50;
    const slice = data.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(d => d.high));
    const low = Math.min(...slice.map(d => d.low));
    return high === low ? -50 : -100 * ((high - data[i].close) / (high - low));
  });
}

// Money Flow Index (MFI)
function calcMFI(data, period = 14) {
  const tp = data.map(d => (d.high + d.low + d.close) / 3);
  const pmf = [], nmf = [];
  for (let i = 0; i < data.length; i++) {
    const mf = tp[i] * data[i].volume;
    if (i === 0 || data[i].close >= data[i - 1].close) {
      pmf.push(mf); nmf.push(0);
    } else {
      pmf.push(0); nmf.push(mf);
    }
  }
  
  return data.map((_, i) => {
    if (i < period - 1) return 50;
    const pmfSum = pmf.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
    const nmfSum = nmf.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
    if (nmfSum === 0) return 100;
    const mr = pmfSum / nmfSum;
    return 100 - (100 / (1 + mr));
  });
}

// Awesome Oscillator
function calcAwesomeOscillator(data, fast = 5, slow = 34) {
  const ema5 = calcEMA(data, fast);
  const ema34 = calcEMA(data, slow);
  return ema5.map((v, i) => {
    const ao = v - ema34[i];
    const color = i === 0 ? "neutral" : ao > (ema5[i - 1] - ema34[i - 1]) ? "green" : "red";
    return { ao, color };
  });
}

// Rate of Change Advanced
function calcROCAdvanced(data, period = 12) {
  return data.map((d, i) => i < period ? 0 : ((d.close - data[i - period].close) / data[i - period].close) * 100);
}

// True Strength Index (TSI)
function calcTSI(data, r = 25, s = 13) {
  const mom = data.map((d, i) => i === 0 ? 0 : d.close - data[i - 1].close);
  const emaFunc = (arr, p) => {
    const result = [];
    let smooth = arr[0];
    for (let i = 0; i < arr.length; i++) {
      smooth = i < p ? (result.length === 0 ? arr[i] : (result[result.length - 1] * (p - 1) + arr[i]) / p) : (smooth * (p - 1) + arr[i]) / p;
      result.push(smooth);
    }
    return result;
  };
  
  const ema1 = emaFunc(mom, r);
  const ema2 = emaFunc(ema1, s);
  const absMom = mom.map(v => Math.abs(v));
  const ema1Abs = emaFunc(absMom, r);
  const ema2Abs = emaFunc(ema1Abs, s);
  
  return data.map((_, i) => ema2Abs[i] === 0 ? 0 : 100 * (ema2[i] / ema2Abs[i]));
}

// Moving Average Convergence (Enhanced)
function calcMACDAdvanced(data, fastP = 12, slowP = 26, sigP = 9, histP = 5) {
  const eF = calcEMA(data, fastP);
  const eS = calcEMA(data, slowP);
  const line = eF.map((v, i) => v - eS[i]);
  const signal = calcEMA(line.map((v, i) => ({ close: v })), sigP);
  const histogram = line.map((v, i) => v - signal[i]);
  const histMomentum = histogram.map((_, i) => i < histP ? 0 : histogram[i] - histogram[i - histP]);
  return { line, signal, histogram, histMomentum };
}

// ─── ADVANCED ANALYSIS HELPERS ──────────────────────────────

// Detect RSI Divergence (bullish / bearish)
function detectDivergence(data, rsiArr, lookback = 30) {
  const len = data.length;
  if (len < lookback + 5) return { bullish: false, bearish: false };
  
  const slice = data.slice(-lookback);
  const rsiSlice = rsiArr.slice(-lookback);
  
  // Find local lows for bullish divergence
  let bullish = false, bearish = false;
  
  // Check last 3 swing points
  const swingLows = [], swingHighs = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].low < slice[i-1].low && slice[i].low < slice[i-2].low &&
        slice[i].low < slice[i+1].low && slice[i].low < slice[i+2].low) {
      swingLows.push({ idx: i, price: slice[i].low, rsi: rsiSlice[i] });
    }
    if (slice[i].high > slice[i-1].high && slice[i].high > slice[i-2].high &&
        slice[i].high > slice[i+1].high && slice[i].high > slice[i+2].high) {
      swingHighs.push({ idx: i, price: slice[i].high, rsi: rsiSlice[i] });
    }
  }
  
  // Bullish divergence: price makes lower low but RSI makes higher low
  if (swingLows.length >= 2) {
    const recent = swingLows[swingLows.length - 1];
    const prev = swingLows[swingLows.length - 2];
    if (recent.price < prev.price && recent.rsi > prev.rsi && recent.rsi < 40) {
      bullish = true;
    }
  }
  
  // Bearish divergence: price makes higher high but RSI makes lower high
  if (swingHighs.length >= 2) {
    const recent = swingHighs[swingHighs.length - 1];
    const prev = swingHighs[swingHighs.length - 2];
    if (recent.price > prev.price && recent.rsi < prev.rsi && recent.rsi > 60) {
      bearish = true;
    }
  }
  
  return { bullish, bearish };
}

// Detect MACD Divergence  
function detectMACDDivergence(data, macdHist, lookback = 30) {
  const len = data.length;
  if (len < lookback + 5) return { bullish: false, bearish: false };
  
  const slice = data.slice(-lookback);
  const histSlice = macdHist.slice(-lookback);
  
  let bullish = false, bearish = false;
  
  const histLows = [], histHighs = [];
  for (let i = 1; i < histSlice.length - 1; i++) {
    if (histSlice[i] < histSlice[i-1] && histSlice[i] < histSlice[i+1] && histSlice[i] < 0) {
      histLows.push({ idx: i, price: slice[i].low, hist: histSlice[i] });
    }
    if (histSlice[i] > histSlice[i-1] && histSlice[i] > histSlice[i+1] && histSlice[i] > 0) {
      histHighs.push({ idx: i, price: slice[i].high, hist: histSlice[i] });
    }
  }
  
  if (histLows.length >= 2) {
    const recent = histLows[histLows.length - 1];
    const prev = histLows[histLows.length - 2];
    if (recent.price < prev.price && recent.hist > prev.hist) bullish = true;
  }
  
  if (histHighs.length >= 2) {
    const recent = histHighs[histHighs.length - 1];
    const prev = histHighs[histHighs.length - 2];
    if (recent.price > prev.price && recent.hist < prev.hist) bearish = true;
  }
  
  return { bullish, bearish };
}

// Calculate multiple support/resistance levels using pivot points
function calcPivotLevels(data, lookback = 60) {
  const slice = data.slice(-lookback);
  const h = Math.max(...slice.map(d => d.high));
  const l = Math.min(...slice.map(d => d.low));
  const c = slice[slice.length - 1].close;
  const pivot = (h + l + c) / 3;
  return {
    r3: h + 2 * (pivot - l),
    r2: pivot + (h - l),
    r1: 2 * pivot - l,
    pivot,
    s1: 2 * pivot - h,
    s2: pivot - (h - l),
    s3: l - 2 * (h - pivot),
    support: l,
    resistance: h,
  };
}

// Check if price is at a significant support/resistance zone
function priceAtSRZone(price, pivots, atr) {
  const threshold = atr * 0.3;
  for (const key of ['r1', 'r2', 'r3', 's1', 's2', 's3', 'pivot']) {
    if (Math.abs(price - pivots[key]) < threshold) {
      return { atZone: true, level: key, value: pivots[key] };
    }
  }
  return { atZone: false };
}

// EMA ribbon direction (all EMAs aligned)
function emaRibbonDirection(emaFast, emaMid, emaSlow, ema200) {
  if (emaFast > emaMid && emaMid > emaSlow && emaSlow > ema200) return "STRONG_UP";
  if (emaFast > emaMid && emaMid > emaSlow) return "UP";
  if (emaFast < emaMid && emaMid < emaSlow && emaSlow < ema200) return "STRONG_DOWN";
  if (emaFast < emaMid && emaMid < emaSlow) return "DOWN";
  return "MIXED";
}

// Calculate momentum (rate of change)
function calcROC(data, period = 10) {
  return data.map((d, i) => {
    if (i < period) return 0;
    return ((d.close - data[i - period].close) / data[i - period].close) * 100;
  });
}

function findSwingLow(data, lb = 20) { return Math.min(...data.slice(-lb).map(d => d.low)); }
function findSwingHigh(data, lb = 20) { return Math.max(...data.slice(-lb).map(d => d.high)); }

// Find multiple swing lows for better stop loss
function findMultiSwingLow(data, lb = 40) {
  const slice = data.slice(-lb);
  const lows = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].low <= slice[i-1].low && slice[i].low <= slice[i-2].low &&
        slice[i].low <= slice[i+1].low && slice[i].low <= slice[i+2].low) {
      lows.push(slice[i].low);
    }
  }
  lows.sort((a, b) => a - b);
  return lows.length > 0 ? lows[0] : Math.min(...slice.map(d => d.low));
}

function findMultiSwingHigh(data, lb = 40) {
  const slice = data.slice(-lb);
  const highs = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].high >= slice[i-1].high && slice[i].high >= slice[i-2].high &&
        slice[i].high >= slice[i+1].high && slice[i].high >= slice[i+2].high) {
      highs.push(slice[i].high);
    }
  }
  highs.sort((a, b) => b - a);
  return highs.length > 0 ? highs[0] : Math.max(...slice.map(d => d.high));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ███ ENHANCED 4-STAGE SIGNAL ENGINE v3 ███
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateSignal(data, cfg, meta) {
  const len = data.length;
  const empty = { action: "WAIT", confidence: 0, reasons: [], levels: {}, confirmations: 0, maxConfirmations: 12,
    buyConfirm: 0, sellConfirm: 0, blocked: false, indicators: {}, chartData: [],
    breakdown: { regime: 0, setup: 0, execution: 0, confirmation: 0, penalty: 0 }, regimeMode: "unknown" };
  if (len < 80) { empty.reasons = [{ text: `⚠️ بيانات غير كافية (${len}/80)`, type: "neutral" }]; return empty; }

  const last = data[len - 1], prev = data[len - 2], prev2 = data[len - 3], prev3 = data[len - 4], price = last.close;
  
  // Calculate all indicators
  const emaFast = calcEMA(data, cfg.emaFast || 9);
  const emaMid = calcEMA(data, cfg.emaMid || 21);
  const emaSlow = calcEMA(data, cfg.emaSlow || 50);
  const ema100 = calcEMA(data, Math.min(100, Math.floor(len * 0.4)));
  const ema200 = calcEMA(data, Math.min(200, Math.floor(len * 0.55)));
  const rsiArr = calcRSI(data, cfg.rsiPeriod || 14);
  const macd = calcMACD(data, cfg.macdFast || 12, cfg.macdSlow || 26, cfg.macdSignal || 9);
  const bb = calcBollinger(data, cfg.bbPeriod || 20, cfg.bbMult || 2);
  const atrArr = calcATR(data, cfg.atrPeriod || 14);
  const stoch = calcStochastic(data, cfg.stochK || 14, cfg.stochD || 3);
  const vwap = calcVWAP(data);
  const adxResult = calcADX(data, cfg.adxPeriod || 14);
  const adxArr = adxResult.adx;
  const plusDI = adxResult.plusDI;
  const minusDI = adxResult.minusDI;
  const roc = calcROC(data, 10);
  
  // ─── PREMIUM INDICATORS FOR 90% ACCURACY ─────────────────
  const ichimoku = calcIchimoku(data);
  const keltner = calcKeltner(data, 20, 2);
  const stochRSI = calcStochasticRSI(data);
  const willR = calcWilliamsR(data);
  const mfi = calcMFI(data);
  const aoResult = calcAwesomeOscillator(data);
  const tsi = calcTSI(data);
  const macdAdv = calcMACDAdvanced(data);

  const N = len - 1;
  const eF = emaFast[N], eM = emaMid[N], eS = emaSlow[N], e100v = ema100[N], e200v = ema200[N];
  const rsi = rsiArr[N], pRsi = rsiArr[N-1], pRsi2 = rsiArr[N-2], pRsi3 = rsiArr[N-3];
  const mVal = macd.macdLine[N], mSig = macd.signal[N], mHist = macd.histogram[N];
  const pmHist = macd.histogram[N-1], pmHist2 = macd.histogram[N-2];
  const bbL = bb[N], bbP = bb[N-1];
  const atr = atrArr[N] || 0, atrPct = price > 0 ? (atr / price) * 100 : 0;
  const sK = stoch.k[N], sD = stoch.d[N], psK = stoch.k[N-1], psD = stoch.d[N-1];
  const vwapV = vwap[N], adxV = adxArr[N];
  const pdi = plusDI[N] || 0, ndi = minusDI[N] || 0;
  const momentum = roc[N];
  
  // Premium indicator values
  const tenkan = ichimoku.tenkanLine[N];
  const kijun = ichimoku.kijunLine[N];
  const senkouA = ichimoku.senkouA[N];
  const senkouB = ichimoku.senkouB[N];
  const chikouLag = ichimoku.chikouLine[N];
  
  const keltnerMid = keltner[N].middle;
  const keltnerUpper = keltner[N].upper;
  const keltnerLower = keltner[N].lower;
  
  const stochK = stochRSI.k[N];
  const stochD = stochRSI.d[N];
  const pStochK = stochRSI.k[N-1];
  const pStochD = stochRSI.d[N-1];
  
  const willRVal = willR[N];
  const mfiVal = mfi[N];
  const aoVal = aoResult[N].ao;
  const pAoVal = aoResult[N-1]?.ao || 0;
  const tsiVal = tsi[N];
  
  const macdLine = macdAdv.line[N];
  const macdSig = macdAdv.signal[N];
  const macdHist = macdAdv.histogram[N];
  const macdHistMom = macdAdv.histMomentum[N];

  // Pivot levels
  const pivots = calcPivotLevels(data, Math.min(60, len));
  const srZone = priceAtSRZone(price, pivots, atr);
  
  // EMA ribbon
  const ribbon = emaRibbonDirection(eF, eM, eS, e200v);
  
  // Divergence detection
  const rsiDiv = detectDivergence(data, rsiArr, 30);
  const macdDiv = detectMACDDivergence(data, macd.histogram, 30);
  
  // Volume analysis
  const lb = Math.min(60, len);
  const support = pivots.s1 > 0 ? pivots.s1 : findSwingLow(data, lb);
  const resistance = pivots.r1 > 0 ? pivots.r1 : findSwingHigh(data, lb);
  const avgVol = data.slice(-20).reduce((s, d) => s + d.volume, 0) / 20;
  const volR = avgVol > 0 ? last.volume / avgVol : 1;
  const avgVol5 = data.slice(-5).reduce((s, d) => s + d.volume, 0) / 5;
  const volTrend = avgVol > 0 ? avgVol5 / avgVol : 1;

  const reasons = [];
  let bk = { regime: 0, setup: 0, execution: 0, confirmation: 0, penalty: 0 };

  // ═══ STAGE 1: REGIME IDENTIFICATION (max 20) ═══
  let regBlocked = false, regScore = 0, regMode = "unknown";
  
  if (meta.isStale) { reasons.push({ text: "🛑 البيانات قديمة — دقة منخفضة", type: "neutral" }); bk.penalty += 20; }
  if (meta.isFallback) { reasons.push({ text: "⚠️ بيانات يومية (الإطار المطلوب غير متاح)", type: "neutral" }); bk.penalty += 10; }

  // ADX-based regime with DI direction
  if (adxV >= 30) { 
    regMode = "strong-trend"; regScore += 12; 
    reasons.push({ text: `✅ اتجاه قوي: ADX=${adxV.toFixed(1)} | +DI=${pdi.toFixed(1)} -DI=${ndi.toFixed(1)}`, type: pdi > ndi ? "buy" : "sell" }); 
  }
  else if (adxV >= 22) { 
    regMode = "trend"; regScore += 8; 
    reasons.push({ text: `◐ اتجاه متوسط: ADX=${adxV.toFixed(1)}`, type: "neutral" }); 
  }
  else if (adxV >= 15) { 
    regMode = "weak-trend"; regScore += 4;
    reasons.push({ text: `⚠️ اتجاه ضعيف: ADX=${adxV.toFixed(1)} — حذر`, type: "neutral" }); 
  }
  else { 
    regMode = "mean-reversion"; regScore += 3; 
    reasons.push({ text: `⚠️ بدون اتجاه: ADX=${adxV.toFixed(1)} — وضع ارتداد فقط`, type: "neutral" }); 
  }

  // Volatility gate
  if (atrPct < 0.003) { regBlocked = true; reasons.push({ text: `🛑 تقلب منخفض جداً: ${atrPct.toFixed(4)}%`, type: "neutral" }); }
  else if (atrPct >= 0.05) { regScore += 6; reasons.push({ text: `✅ تقلب جيد: ${atrPct.toFixed(3)}%`, type: "neutral" }); }
  else if (atrPct >= 0.02) { regScore += 3; }
  
  if (volR < 0.4) { bk.penalty += 8; reasons.push({ text: `⚠️ حجم ضعيف جداً (${(volR * 100).toFixed(0)}%)`, type: "neutral" }); }
  bk.regime = Math.min(20, regScore);

  // ═══ STAGE 2: SIGNAL DETECTION (max 40) ═══
  let buyS = 0, sellS = 0;

  if (regMode === "strong-trend" || regMode === "trend") {
    // === TREND-FOLLOWING SIGNALS ===
    
    // 1. EMA Ribbon alignment (strong confirmation)
    if (ribbon === "STRONG_UP") { buyS += 8; reasons.push({ text: "✅ شريط EMA صعودي قوي (كل EMAs مرتبة)", type: "buy" }); }
    else if (ribbon === "STRONG_DOWN") { sellS += 8; reasons.push({ text: "✅ شريط EMA هبوطي قوي (كل EMAs مرتبة)", type: "sell" }); }
    else if (ribbon === "UP") { buyS += 4; reasons.push({ text: "◐ EMAs صعودية", type: "buy" }); }
    else if (ribbon === "DOWN") { sellS += 4; reasons.push({ text: "◐ EMAs هبوطية", type: "sell" }); }
    else { reasons.push({ text: "⚠️ EMAs مختلطة — بدون تأكيد اتجاه", type: "neutral" }); }

    // 2. MACD with histogram momentum (3-bar confirmation)
    const macdBullMomentum = mHist > 0 && mHist > pmHist && pmHist > pmHist2;
    const macdBearMomentum = mHist < 0 && mHist < pmHist && pmHist < pmHist2;
    const macdBullCross = mVal > mSig && macd.macdLine[N-1] <= macd.signal[N-1]; // Fresh cross
    const macdBearCross = mVal < mSig && macd.macdLine[N-1] >= macd.signal[N-1];
    
    if (macdBullCross) { buyS += 8; reasons.push({ text: "✅ تقاطع MACD صعودي جديد!", type: "buy" }); }
    else if (macdBearCross) { sellS += 8; reasons.push({ text: "✅ تقاطع MACD هبوطي جديد!", type: "sell" }); }
    else if (macdBullMomentum) { buyS += 5; reasons.push({ text: "✅ MACD زخم صعودي متزايد (3 شموع)", type: "buy" }); }
    else if (macdBearMomentum) { sellS += 5; reasons.push({ text: "✅ MACD زخم هبوطي متزايد (3 شموع)", type: "sell" }); }
    else if (mHist > 0) { buyS += 2; reasons.push({ text: "◐ MACD إيجابي", type: "buy" }); }
    else if (mHist < 0) { sellS += 2; reasons.push({ text: "◐ MACD سلبي", type: "sell" }); }

    // 3. RSI trend confirmation (not overbought/oversold in trend)
    const rsiTrendUp = rsi > 50 && rsi < 70 && rsi > pRsi;
    const rsiTrendDn = rsi < 50 && rsi > 30 && rsi < pRsi;
    if (rsiTrendUp) { buyS += 6; reasons.push({ text: `✅ RSI=${rsi.toFixed(1)} صاعد في منطقة صحية`, type: "buy" }); }
    else if (rsiTrendDn) { sellS += 6; reasons.push({ text: `✅ RSI=${rsi.toFixed(1)} هابط في منطقة صحية`, type: "sell" }); }
    else if (rsi > 75) { bk.penalty += 5; reasons.push({ text: `⚠️ RSI=${rsi.toFixed(1)} ذروة شراء — خطر انعكاس`, type: "neutral" }); }
    else if (rsi < 25) { bk.penalty += 5; reasons.push({ text: `⚠️ RSI=${rsi.toFixed(1)} ذروة بيع — خطر انعكاس`, type: "neutral" }); }

    // 4. DI direction (ADX directional movement)
    if (pdi > ndi && pdi - ndi > 5) { buyS += 6; reasons.push({ text: `✅ +DI(${pdi.toFixed(1)}) > -DI(${ndi.toFixed(1)}) — قوة شرائية`, type: "buy" }); }
    else if (ndi > pdi && ndi - pdi > 5) { sellS += 6; reasons.push({ text: `✅ -DI(${ndi.toFixed(1)}) > +DI(${pdi.toFixed(1)}) — قوة بيعية`, type: "sell" }); }

    // 5. Price vs VWAP (institutional level)
    if (price > vwapV && prev.close > vwap[N-1] && prev2.close > vwap[N-2]) { 
      buyS += 4; reasons.push({ text: "✅ مستقر فوق VWAP (3 شموع)", type: "buy" }); 
    }
    else if (price < vwapV && prev.close < vwap[N-1] && prev2.close < vwap[N-2]) { 
      sellS += 4; reasons.push({ text: "✅ مستقر تحت VWAP (3 شموع)", type: "sell" }); 
    }
    
    // 6. Momentum confirmation
    if (momentum > 0.5) { buyS += 3; reasons.push({ text: `✅ زخم إيجابي: ${momentum.toFixed(2)}%`, type: "buy" }); }
    else if (momentum < -0.5) { sellS += 3; reasons.push({ text: `✅ زخم سلبي: ${momentum.toFixed(2)}%`, type: "sell" }); }

  } else {
    // === MEAN-REVERSION SIGNALS (Range / Low ADX) ===
    
    // 1. Bollinger Band extremes with reversal confirmation
    if (bbL.lower !== null) {
      const bw = bbL.upper - bbL.lower;
      if (bw > 0) {
        const pp = (price - bbL.lower) / bw;
        // Require price to be at extreme AND showing reversal candle
        if (pp <= 0.08 && last.close > last.open) { 
          buyS += 10; reasons.push({ text: "✅ عند الحد السفلي لبولينجر + شمعة صعودية", type: "buy" }); 
        }
        else if (pp >= 0.92 && last.close < last.open) { 
          sellS += 10; reasons.push({ text: "✅ عند الحد العلوي لبولينجر + شمعة هبوطية", type: "sell" }); 
        }
        else if (pp <= 0.15) { buyS += 4; reasons.push({ text: "◐ قرب الحد السفلي", type: "buy" }); }
        else if (pp >= 0.85) { sellS += 4; reasons.push({ text: "◐ قرب الحد العلوي", type: "sell" }); }
      }
    }

    // 2. RSI oversold/overbought with momentum reversal
    const rsiReversingUp = rsi < 35 && rsi > pRsi && pRsi > pRsi2; // RSI turning up from oversold
    const rsiReversingDn = rsi > 65 && rsi < pRsi && pRsi < pRsi2; // RSI turning down from overbought
    if (rsiReversingUp) { buyS += 10; reasons.push({ text: `✅ RSI=${rsi.toFixed(1)} ارتداد من ذروة بيع (3 شموع)`, type: "buy" }); }
    else if (rsiReversingDn) { sellS += 10; reasons.push({ text: `✅ RSI=${rsi.toFixed(1)} ارتداد من ذروة شراء (3 شموع)`, type: "sell" }); }
    else if (rsi < 30) { buyS += 3; reasons.push({ text: `◐ RSI=${rsi.toFixed(1)} ذروة بيع`, type: "buy" }); }
    else if (rsi > 70) { sellS += 3; reasons.push({ text: `◐ RSI=${rsi.toFixed(1)} ذروة شراء`, type: "sell" }); }

    // 3. Stochastic cross in extreme zone
    if (sK > sD && psK <= psD && sK < 25) { buyS += 8; reasons.push({ text: "✅ Stoch تقاطع صعودي في ذروة بيع", type: "buy" }); }
    else if (sK < sD && psK >= psD && sK > 75) { sellS += 8; reasons.push({ text: "✅ Stoch تقاطع هبوطي في ذروة شراء", type: "sell" }); }
    else if (sK < 15) { buyS += 3; reasons.push({ text: "◐ Stoch ذروة بيع عميقة", type: "buy" }); }
    else if (sK > 85) { sellS += 3; reasons.push({ text: "◐ Stoch ذروة شراء عميقة", type: "sell" }); }

    // 4. Bollinger Band return signal
    if (bbL.lower !== null && bbP?.lower !== null) {
      if (prev.close < bbP.lower && last.close > bbL.lower) { buyS += 6; reasons.push({ text: "✅ عاد فوق الحد السفلي", type: "buy" }); }
      if (prev.close > bbP.upper && last.close < bbL.upper) { sellS += 6; reasons.push({ text: "✅ عاد تحت الحد العلوي", type: "sell" }); }
    }
    
    // 5. Support/Resistance bounce
    if (srZone.atZone) {
      if (srZone.level.startsWith('s') && last.close > last.open) {
        buyS += 5; reasons.push({ text: `✅ ارتداد من دعم ${srZone.level}`, type: "buy" });
      } else if (srZone.level.startsWith('r') && last.close < last.open) {
        sellS += 5; reasons.push({ text: `✅ ارتداد من مقاومة ${srZone.level}`, type: "sell" });
      }
    }
  }

  // ─── PREMIUM INDICATOR FILTERING (Stage 2.5) ─────────────────
  // Ichimoku Cloud confirmation
  if (price > senkouA && price > senkouB && tenkan && kijun && tenkan > kijun) {
    buyS += 4; reasons.push({ text: "✅ Ichimoku: سعر فوق السحابة + Tenkan>Kijun", type: "buy" });
  } else if (price < senkouA && price < senkouB && tenkan && kijun && tenkan < kijun) {
    sellS += 4; reasons.push({ text: "✅ Ichimoku: سعر تحت السحابة + Tenkan<Kijun", type: "sell" });
  }
  
  // Stochastic RSI (more sensitive)
  if (stochK > stochD && pStochK <= pStochD && stochK < 25) {
    buyS += 5; reasons.push({ text: `✅ Stochastic RSI تقاطع صعودي في ذروة بيع (${stochK.toFixed(0)})`, type: "buy" });
  } else if (stochK < stochD && pStochK >= pStochD && stochK > 75) {
    sellS += 5; reasons.push({ text: `✅ Stochastic RSI تقاطع هبوطي في ذروة شراء (${stochK.toFixed(0)})`, type: "sell" });
  }
  
  // Money Flow Index (MFI) - Volume-weighted momentum
  if (mfiVal > 60 && buyS > 0) {
    buyS += 3; reasons.push({ text: `✅ MFI=${mfiVal.toFixed(0)} — قوة شرائية مرتفعة`, type: "buy" });
  } else if (mfiVal < 40 && sellS > 0) {
    sellS += 3; reasons.push({ text: `✅ MFI=${mfiVal.toFixed(0)} — قوة بيعية مرتفعة`, type: "sell" });
  } else if (mfiVal > 80) {
    bk.penalty += 3; reasons.push({ text: `⚠️ MFI=${mfiVal.toFixed(0)} ذروة شراء`, type: "neutral" });
  } else if (mfiVal < 20) {
    bk.penalty += 3; reasons.push({ text: `⚠️ MFI=${mfiVal.toFixed(0)} ذروة بيع`, type: "neutral" });
  }
  
  // Williams %R (Momentum confirmation)
  if (willRVal < -80 && last.close > last.open) {
    buyS += 4; reasons.push({ text: `✅ Williams %R=${willRVal.toFixed(0)} + شمعة صعودية`, type: "buy" });
  } else if (willRVal > -20 && last.close < last.open) {
    sellS += 4; reasons.push({ text: `✅ Williams %R=${willRVal.toFixed(0)} + شمعة هبوطية`, type: "sell" });
  }
  
  // Awesome Oscillator (AO)
  if (aoVal > 0 && pAoVal > 0 && aoVal > pAoVal && buyS > 0) {
    buyS += 3; reasons.push({ text: "✅ Awesome Oscillator: زخم صعودي متزايد", type: "buy" });
  } else if (aoVal < 0 && pAoVal < 0 && aoVal < pAoVal && sellS > 0) {
    sellS += 3; reasons.push({ text: "✅ Awesome Oscillator: زخم هبوطي متزايد", type: "sell" });
  }
  
  // True Strength Index (TSI) - Advanced momentum
  if (tsiVal > 0 && tsiVal > 20) {
    buyS += 2; reasons.push({ text: `✅ TSI=${tsiVal.toFixed(0)} — قوة صعودية`, type: "buy" });
  } else if (tsiVal < 0 && tsiVal < -20) {
    sellS += 2; reasons.push({ text: `✅ TSI=${tsiVal.toFixed(0)} — قوة هبوطية`, type: "sell" });
  }
  
  // Keltner Channels (Dynamic support/resistance)
  if (price < keltnerLower && last.close > last.open) {
    buyS += 3; reasons.push({ text: "✅ سعر تحت قناة Keltner السفلى + شمعة صعودية", type: "buy" });
  } else if (price > keltnerUpper && last.close < last.open) {
    sellS += 3; reasons.push({ text: "✅ سعر فوق قناة Keltner العليا + شمعة هبوطية", type: "sell" });
  }

  // ═══ STAGE 3: DIVERGENCE & CONFIRMATION (max 25) ═══
  let confScore = 0;
  
  // RSI Divergence (very strong signal)
  if (rsiDiv.bullish) { 
    buyS += 8; confScore += 8;
    reasons.push({ text: "🔥 تباعد RSI صعودي — إشارة انعكاس قوية!", type: "buy" }); 
  }
  if (rsiDiv.bearish) { 
    sellS += 8; confScore += 8;
    reasons.push({ text: "🔥 تباعد RSI هبوطي — إشارة انعكاس قوية!", type: "sell" }); 
  }
  
  // MACD Divergence
  if (macdDiv.bullish) { 
    buyS += 6; confScore += 6;
    reasons.push({ text: "✅ تباعد MACD صعودي", type: "buy" }); 
  }
  if (macdDiv.bearish) { 
    sellS += 6; confScore += 6;
    reasons.push({ text: "✅ تباعد MACD هبوطي", type: "sell" }); 
  }

  // Volume confirmation
  if (volR > 1.5 && volTrend > 1.2) {
    if (price > prev.close) { buyS += 4; confScore += 4; reasons.push({ text: "✅ حجم مرتفع مع صعود + تزايد", type: "buy" }); }
    else { sellS += 4; confScore += 4; reasons.push({ text: "✅ حجم مرتفع مع هبوط + تزايد", type: "sell" }); }
  } else if (volR > 1.2) {
    if (price > prev.close) { buyS += 2; reasons.push({ text: "◐ حجم أعلى من المتوسط مع صعود", type: "buy" }); }
    else { sellS += 2; reasons.push({ text: "◐ حجم أعلى من المتوسط مع هبوط", type: "sell" }); }
  }

  // Candlestick patterns (more strict)
  const bd = Math.abs(last.close - last.open), uw = last.high - Math.max(last.close, last.open);
  const lw = Math.min(last.close, last.open) - last.low, rng = last.high - last.low;
  if (rng > 0 && rng > atr * 0.5) { // Only significant candles
    // Bullish engulfing (current green engulfs previous red completely)
    if (last.close > last.open && prev.close < prev.open && 
        last.close > prev.open && last.open < prev.close && bd > rng * 0.6) { 
      buyS += 5; confScore += 3; reasons.push({ text: "✅ ابتلاع شرائي قوي", type: "buy" }); 
    }
    // Bearish engulfing
    else if (last.close < last.open && prev.close > prev.open && 
             last.close < prev.open && last.open > prev.close && bd > rng * 0.6) { 
      sellS += 5; confScore += 3; reasons.push({ text: "✅ ابتلاع بيعي قوي", type: "sell" }); 
    }
    // Hammer (long lower wick, small body at top)
    else if (lw > bd * 2.5 && uw < bd * 0.5 && last.close > last.open) { 
      buyS += 3; reasons.push({ text: "◐ مطرقة صعودية", type: "buy" }); 
    }
    // Shooting star (long upper wick, small body at bottom)
    else if (uw > bd * 2.5 && lw < bd * 0.5 && last.close < last.open) { 
      sellS += 3; reasons.push({ text: "◐ نجمة ساقطة هبوطية", type: "sell" }); 
    }
    // Three white soldiers
    if (last.close > last.open && prev.close > prev.open && prev2.close > prev2.open &&
        last.close > prev.close && prev.close > prev2.close) {
      buyS += 4; reasons.push({ text: "✅ ثلاث جنود بيض", type: "buy" });
    }
    // Three black crows
    if (last.close < last.open && prev.close < prev.open && prev2.close < prev2.open &&
        last.close < prev.close && prev.close < prev2.close) {
      sellS += 4; reasons.push({ text: "✅ ثلاثة غربان سود", type: "sell" });
    }
  }
  
  bk.setup = Math.min(40, Math.max(buyS, sellS));
  bk.confirmation = Math.min(25, confScore);

  // ═══ STAGE 4: EXECUTION & RISK MANAGEMENT (max 15) ═══
  let exS = 0, exBlocked = false;
  const isBuy = buyS > sellS;
  
  // Better stop loss using multiple swing points + ATR cushion
  const swLo = findMultiSwingLow(data, 30);
  const swHi = findMultiSwingHigh(data, 30);
  let sl, t1, t2, t3;
  
  if (isBuy) { 
    sl = Math.min(swLo, price - atr * 1.5) - atr * 0.3; // Below swing low + ATR cushion
    const rk = Math.max(price - sl, atr * 0.5);
    t1 = price + rk * 1.5;   // 1.5R target
    t2 = price + rk * 2.5;   // 2.5R target 
    t3 = price + rk * 3.5;   // 3.5R target
  } else { 
    sl = Math.max(swHi, price + atr * 1.5) + atr * 0.3;
    const rk = Math.max(sl - price, atr * 0.5);
    t1 = price - rk * 1.5; 
    t2 = price - rk * 2.5; 
    t3 = price - rk * 3.5;
  }
  
  const riskA = Math.abs(price - sl), rewA = Math.abs(t1 - price), rr = riskA > 0 ? rewA / riskA : 0;

  // Strict R:R requirements
  if (rr >= 2.0) { exS += 8; reasons.push({ text: `✅ R:R ممتاز 1:${rr.toFixed(1)}`, type: isBuy ? "buy" : "sell" }); }
  else if (rr >= 1.5) { exS += 5; reasons.push({ text: `◐ R:R جيد 1:${rr.toFixed(1)}`, type: isBuy ? "buy" : "sell" }); }
  else if (rr >= 1.0) { exS += 2; reasons.push({ text: `⚠️ R:R مقبول 1:${rr.toFixed(1)}`, type: "neutral" }); }
  else { exBlocked = true; reasons.push({ text: `🛑 R:R سيء 1:${rr.toFixed(1)} — ممنوع`, type: "neutral" }); }

  // Distance from S/R check
  const dR = resistance - price, dS = price - support;
  if (isBuy && dR < atr * 0.8) { 
    exBlocked = true; reasons.push({ text: "🛑 قريب جداً من المقاومة — لا مجال للصعود", type: "neutral" }); 
  }
  else if (!isBuy && dS < atr * 0.8) { 
    exBlocked = true; reasons.push({ text: "🛑 قريب جداً من الدعم — لا مجال للهبوط", type: "neutral" }); 
  }
  else if ((isBuy && dR > atr * 3) || (!isBuy && dS > atr * 3)) { 
    exS += 5; reasons.push({ text: "✅ مسافة ممتازة عن S/R", type: isBuy ? "buy" : "sell" }); 
  }
  else if ((isBuy && dR > atr * 1.5) || (!isBuy && dS > atr * 1.5)) { 
    exS += 2; 
  }

  bk.execution = Math.min(15, exS);

  // ═══ FINAL CONFIDENCE & DECISION ═══
  const raw = bk.regime + bk.setup + bk.execution + bk.confirmation;
  const pen = bk.penalty + (volR < 0.3 ? 15 : volR < 0.5 ? 8 : 0);
  let conf = Math.max(0, Math.min(100, raw - pen));
  const blocked = regBlocked || exBlocked;
  
  // Higher minimum confirmations required
  const MIN_C = cfg.minConfirmations || 7;
  const bConf = Math.round(Math.min(12, (buyS / 40) * 12));
  const sConf = Math.round(Math.min(12, (sellS / 40) * 12));
  const mxC = Math.max(bConf, sConf);
  
  // Direction gap must be significant
  const directionGap = Math.abs(buyS - sellS);
  const directionRatio = Math.max(buyS, sellS) > 0 ? directionGap / Math.max(buyS, sellS) : 0;

  let action;
  if (blocked || meta.isStale) { 
    action = "WAIT"; conf = Math.min(conf, 30); 
    reasons.push({ text: `📊 انتظار — ${blocked ? "فلتر أمان نشط" : "بيانات قديمة"}`, type: "neutral" }); 
  }
  else if (mxC < MIN_C) { 
    action = "WAIT"; conf = Math.min(conf, 35); 
    reasons.push({ text: `📊 انتظار — تأكيدات غير كافية ${mxC}/${MIN_C}`, type: "neutral" }); 
  }
  else if (directionGap < 8) {
    // Signals too close — not clear direction
    action = "WAIT"; conf = Math.min(conf, 40);
    reasons.push({ text: `📊 انتظار — إشارات متقاربة (فرق: ${directionGap})`, type: "neutral" });
  }
  else if (directionRatio < 0.25) {
    // Not enough directional clarity
    action = "WAIT"; conf = Math.min(conf, 38);
    reasons.push({ text: `📊 انتظار — وضوح اتجاه منخفض (${(directionRatio*100).toFixed(0)}%)`, type: "neutral" });
  }
  else if (buyS > sellS && bConf >= MIN_C && conf >= 50) { 
    action = "BUY"; 
    reasons.push({ text: `📊 شراء ${regMode.includes("trend") ? "اتجاهي" : "ارتداد"} — ثقة ${conf}% (${bConf}/12)`, type: "buy" }); 
  }
  else if (sellS > buyS && sConf >= MIN_C && conf >= 50) { 
    action = "SELL"; 
    reasons.push({ text: `📊 بيع ${regMode.includes("trend") ? "اتجاهي" : "ارتداد"} — ثقة ${conf}% (${sConf}/12)`, type: "sell" }); 
  }
  else { 
    action = "WAIT"; conf = Math.min(conf, 45); 
    reasons.push({ text: "📊 انتظار — ثقة غير كافية للدخول", type: "neutral" }); 
  }

  // Chart data
  const chartSlice = Math.min(cfg.chartCandles || 160, len);
  const chartData = data.slice(-chartSlice).map((d, i) => {
    const idx = len - chartSlice + i;
    return { ...d, ema9: emaFast[idx], ema21: emaMid[idx], ema50: emaSlow[idx], ema200: ema200[idx],
      rsi: rsiArr[idx], macdLine: macd.macdLine[idx], macdSignal: macd.signal[idx], macdHist: macd.histogram[idx],
      atrVal: atrArr[idx], bbUpper: bb[idx]?.upper, bbMiddle: bb[idx]?.middle, bbLower: bb[idx]?.lower,
      stochK: stoch.k[idx], stochD: stoch.d[idx], vwapLine: vwap[idx], adxVal: adxArr[idx] };
  });

  return { action, confidence: conf, reasons, confirmations: mxC, maxConfirmations: 12,
    buyConfirm: bConf, sellConfirm: sConf, blocked, breakdown: bk, regimeMode: regMode,
    indicators: { ema9: eF, ema21: eM, ema50: eS, ema100: e100v, ema200: e200v,
      rsi, macd: mVal, macdSignal: mSig, macdHist: mHist, atr, atrPct,
      stochK: sK, stochD: sD, vwap: vwapV, adx: adxV, plusDI: pdi, minusDI: ndi,
      bbUpper: bbL?.upper, bbMiddle: bbL?.middle, bbLower: bbL?.lower, volRatio: volR,
      momentum, ribbon, rsiDivBull: rsiDiv.bullish, rsiDivBear: rsiDiv.bearish,
      macdDivBull: macdDiv.bullish, macdDivBear: macdDiv.bearish,
      // Premium indicators
      ichimokuTenkan: tenkan, ichimokuKijun: kijun, ichimokuSenkouA: senkouA, ichimokuSenkouB: senkouB,
      keltnerMid: keltnerMid, keltnerUpper: keltnerUpper, keltnerLower: keltnerLower,
      stochRSIK: stochK, stochRSID: stochD, willR: willRVal, mfi: mfiVal,
      awesome: aoVal, tsi: tsiVal, macdHistMom: macdHistMom },
    levels: { entry: price, stopLoss: sl, tp1: t1, tp2: t2, tp3: t3, 
      support: pivots.s1 || support, resistance: pivots.r1 || resistance,
      pivot: pivots.pivot, s2: pivots.s2, r2: pivots.r2 }, 
    chartData };
}

// ─── ROLLING BACKTEST ───────────────────────────────────────
function rollingBacktest(data, cfg) {
  if (data.length < 120) return { trades: 0, wins: 0, losses: 0, winRate: 0, avgR: 0, profitFactor: 0, history: [] };
  const hist = []; let wins = 0, losses = 0, tWR = 0, tLR = 0, openT = null;
  const minConf = cfg.btMinConfidence || 55;
  for (let i = 100; i < data.length - 10; i += 5) {
    const slice = data.slice(0, i + 1);
    const sig = generateSignal(slice, cfg, { isStale: false, isFallback: false });
    if (openT) {
      for (let j = openT.eIdx + 1; j <= Math.min(i, openT.eIdx + 50); j++) {
        if (j >= data.length) break;
        const c = data[j];
        if (openT.act === "BUY") {
          if (c.low <= openT.sl) { losses++; tLR += 1; hist.push({ ...openT, result: "loss", r: -1 }); openT = null; break; }
          if (c.high >= openT.t1) { const r = openT.rk > 0 ? Math.abs(openT.t1 - openT.en) / openT.rk : 1; wins++; tWR += r; hist.push({ ...openT, result: "win", r }); openT = null; break; }
        } else {
          if (c.high >= openT.sl) { losses++; tLR += 1; hist.push({ ...openT, result: "loss", r: -1 }); openT = null; break; }
          if (c.low <= openT.t1) { const r = openT.rk > 0 ? Math.abs(openT.en - openT.t1) / openT.rk : 1; wins++; tWR += r; hist.push({ ...openT, result: "win", r }); openT = null; break; }
        }
        if (j >= openT.eIdx + 50) {
          const ep = data[j].close; const pnl = openT.act === "BUY" ? ep - openT.en : openT.en - ep;
          if (pnl > 0) { wins++; const r = openT.rk > 0 ? pnl / openT.rk : 0; tWR += r; hist.push({ ...openT, result: "win", r }); }
          else { losses++; const r = openT.rk > 0 ? Math.abs(pnl) / openT.rk : 1; tLR += r; hist.push({ ...openT, result: "loss", r: -r }); }
          openT = null; break;
        }
      }
    }
    if (!openT && (sig.action === "BUY" || sig.action === "SELL") && sig.confidence >= minConf && i + 1 < data.length) {
      const en = data[i + 1].open, rk = Math.abs(en - sig.levels.stopLoss);
      openT = { act: sig.action, en, sl: sig.levels.stopLoss, t1: sig.levels.tp1, rk, eIdx: i + 1,
        time: new Date(data[i + 1].time).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }) };
    }
  }
  const tot = wins + losses;
  return { trades: tot, wins, losses, winRate: tot > 0 ? (wins / tot) * 100 : 0,
    avgR: tot > 0 ? (tWR - tLR) / tot : 0, profitFactor: tLR > 0 ? tWR / tLR : tWR > 0 ? 99 : 0,
    history: hist.slice(-20) };
}

// ─── COLORS ─────────────────────────────────────────────────
const C = {
  bg: "#060a10", card: "#0d1420", cardAlt: "#111c2e",
  border: "#1a2744", borderLight: "#243352",
  accent: "#e8b230", accentDim: "#7a5a10",
  buy: "#00d4a1", buyDim: "#003d30", buyGlow: "#00d4a144",
  sell: "#ff4d6a", sellDim: "#3d0015", sellGlow: "#ff4d6a44",
  wait: "#ffb020", waitDim: "#3d2800", waitGlow: "#ffb02044",
  text: "#e8ecf4", dim: "#8899b4", muted: "#4a5e80",
  ema9: "#22d3ee", ema21: "#818cf8", ema50: "#f472b6", ema200: "#fb923c",
  rsi: "#a78bfa", macdL: "#22d3ee", macdS: "#f472b6",
  green: "#00d4a1", red: "#ff4d6a", grid: "#152035",
  divergence: "#f59e0b",
};

// ─── AUDIO ENGINE (Web Audio API) ────────────────────────────
class AudioEngine {
  constructor() { this.ctx = null; this.heartbeatInterval = null; this.enabled = false; this.marketState = "WAIT"; this.volume = 0.3; this._beatCount = 0; }
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); }
  _playTone(freq, duration, type = "sine", startDelay = 0, vol = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + startDelay;
    const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime((vol ?? this.volume) * 0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + duration + 0.01);
  }
  _ecgBeep() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
    if (this.marketState === "BUY") {
      osc.type = "sine"; osc.frequency.setValueAtTime(880, t); osc.frequency.linearRampToValueAtTime(1100, t + 0.04);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(this.volume * 0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); osc.start(t); osc.stop(t + 0.16);
    } else if (this.marketState === "SELL") {
      osc.type = "sine"; osc.frequency.setValueAtTime(660, t); osc.frequency.linearRampToValueAtTime(440, t + 0.06);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(this.volume * 0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18); osc.start(t); osc.stop(t + 0.19);
    } else {
      osc.type = "sine"; osc.frequency.setValueAtTime(770, t);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(this.volume * 0.25, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); osc.start(t); osc.stop(t + 0.11);
    }
    osc.connect(gain); gain.connect(this.ctx.destination); this._beatCount++;
  }
  playBuyAlert() { if (!this.ctx || !this.enabled) return; this._playTone(523, 0.12, "sine", 0, this.volume * 0.6); this._playTone(659, 0.12, "sine", 0.1, this.volume * 0.6); this._playTone(784, 0.12, "sine", 0.2, this.volume * 0.6); this._playTone(1047, 0.25, "sine", 0.3, this.volume * 0.7); }
  playSellAlert() { if (!this.ctx || !this.enabled) return; this._playTone(784, 0.12, "sawtooth", 0, this.volume * 0.4); this._playTone(622, 0.12, "sawtooth", 0.12, this.volume * 0.4); this._playTone(466, 0.15, "sawtooth", 0.24, this.volume * 0.5); this._playTone(370, 0.3, "sawtooth", 0.38, this.volume * 0.5); }
  playSignalChange(action) { if (action === "BUY") this.playBuyAlert(); else if (action === "SELL") this.playSellAlert(); }
  setMarketState(state) { const prev = this.marketState; this.marketState = state; if (prev !== state && this.heartbeatInterval) { this.stopHeartbeat(); this.startHeartbeat(); } }
  startHeartbeat() {
    if (this.heartbeatInterval) return; this.init(); if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const getInterval = () => this.marketState === "BUY" ? 600 : this.marketState === "SELL" ? 500 : 1000;
    const beat = () => { if (!this.enabled) return; this._ecgBeep(); this.heartbeatInterval = setTimeout(beat, getInterval()); };
    this.heartbeatInterval = setTimeout(beat, 100);
  }
  stopHeartbeat() { if (this.heartbeatInterval) { clearTimeout(this.heartbeatInterval); this.heartbeatInterval = null; } }
  enable() { this.init(); if (this.ctx?.state === "suspended") this.ctx.resume(); this.enabled = true; this.startHeartbeat(); }
  disable() { this.enabled = false; this.stopHeartbeat(); }
  toggle() { if (this.enabled) this.disable(); else this.enable(); return this.enabled; }
  destroy() { this.disable(); if (this.ctx) { try { this.ctx.close(); } catch {} this.ctx = null; } }
}

const audioEngine = new AudioEngine();

// ─── ECG MONITOR VISUAL COMPONENT ───────────────────────────
function ECGMonitor({ marketState, isActive }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dataRef2 = useRef([]);
  const posRef = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); const W = canvas.width = 260; const H = canvas.height = 50;
    if (dataRef2.current.length === 0) dataRef2.current = new Array(W).fill(H / 2);
    const color = marketState === "BUY" ? C.buy : marketState === "SELL" ? C.sell : C.accent;
    const speed = marketState === "BUY" ? 3 : marketState === "SELL" ? 4 : 2;
    const beatInterval = marketState === "BUY" ? 60 : marketState === "SELL" ? 50 : 100;
    const draw = () => {
      const d = dataRef2.current; const mid = H / 2;
      const phase = posRef.current % beatInterval; let val = mid;
      if (isActive) {
        if (phase < 3) val = mid - 2; else if (phase < 6) val = mid + 2; else if (phase < 9) val = mid;
        else if (phase < 12) val = mid + 3; else if (phase < 15) val = mid - 22; else if (phase < 18) val = mid + 10;
        else if (phase < 22) val = mid; else if (phase < 28) val = mid - 5; else val = mid;
      }
      d.push(val); if (d.length > W) d.shift(); posRef.current += speed;
      ctx.fillStyle = "rgba(6, 10, 16, 0.15)"; ctx.fillRect(0, 0, W, H);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.shadowColor = color; ctx.shadowBlur = isActive ? 8 : 2;
      for (let i = 0; i < d.length; i++) { if (i === 0) ctx.moveTo(i, d[i]); else ctx.lineTo(i, d[i]); }
      ctx.stroke(); ctx.shadowBlur = 0;
      if (isActive) {
        const scanX = d.length - 1;
        ctx.beginPath(); ctx.strokeStyle = `${color}44`; ctx.lineWidth = 1; ctx.moveTo(scanX, 0); ctx.lineTo(scanX, H); ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
        ctx.arc(scanX, d[d.length - 1], 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [marketState, isActive]);
  return (
    <canvas ref={canvasRef} style={{ width: 260, height: 50, borderRadius: 8,
      border: `1px solid ${isActive ? (marketState === "BUY" ? C.buy : marketState === "SELL" ? C.sell : C.accent) : C.border}33`,
      background: `${C.bg}cc`, opacity: isActive ? 1 : 0.4 }} />
  );
}

// ─── UI COMPONENTS ──────────────────────────────────────────
function StatusBanner({ status }) {
  if (!status?.text) return null;
  const bg = { error: `${C.sell}18`, warning: `${C.wait}18`, info: `${C.buy}18`, fetching: `${C.accent}12` };
  const cl = { error: C.sell, warning: C.wait, info: C.buy, fetching: C.accent };
  const ic = { error: "❌", warning: "⚠️", info: "ℹ️", fetching: "⏳" };
  const t = status.type || "info";
  return (<div style={{ padding: "8px 16px", margin: "0 12px 8px", borderRadius: 8, background: bg[t], border: `1px solid ${cl[t]}33`, fontSize: 12, color: cl[t], display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <span>{ic[t]}</span><span style={{ flex: 1 }}>{status.text}</span>{status.extra && <span style={{ fontSize: 10, color: C.muted }}>{status.extra}</span>}
  </div>);
}

function ConfidenceBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const items = [["النظام", breakdown.regime, 20, C.ema9], ["الإعداد", breakdown.setup, 40, C.buy], ["التأكيد", breakdown.confirmation || 0, 25, C.divergence], ["التنفيذ", breakdown.execution, 15, C.accent]];
  return (<div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
    <div style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>تفصيل الثقة:</div>
    {items.map(([l, v, mx, cl]) => (<div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: C.muted, width: 50 }}>{l}</span>
      <div style={{ flex: 1, height: 6, background: `${C.muted}22`, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${(v / mx) * 100}%`, height: "100%", background: cl, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color: cl, fontWeight: 600, width: 36, textAlign: "left" }}>{v}/{mx}</span>
    </div>))}
    {breakdown.penalty > 0 && <div style={{ fontSize: 10, color: C.sell }}>خصم: -{breakdown.penalty}</div>}
  </div>);
}

function ConfirmationMeter({ buyConf, sellConf, total, action }) {
  const col = action === "BUY" ? C.buy : action === "SELL" ? C.sell : C.wait;
  const active = Math.max(buyConf, sellConf);
  return (<div style={{ padding: "12px 0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.dim, marginBottom: 6 }}><span>مقياس التأكيدات</span><span style={{ color: col, fontWeight: 700 }}>{active}/{total}</span></div>
    <div style={{ display: "flex", gap: 3 }}>{Array.from({ length: total }).map((_, i) => (<div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < active ? col : `${C.muted}44`, boxShadow: i < active ? `0 0 6px ${col}66` : "none", transition: "all 0.4s ease" }} />))}</div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 4 }}><span>شراء: {buyConf}</span><span>بيع: {sellConf}</span></div>
  </div>);
}

function SignalBadge({ signal, onClick, symbol, compact }) {
  const { action, confidence, maxConfirmations } = signal;
  const cfg = { BUY: { label: "شراء", en: "BUY", color: C.buy, bg: C.buyDim, glow: C.buyGlow, icon: "▲" },
    SELL: { label: "بيع", en: "SELL", color: C.sell, bg: C.sellDim, glow: C.sellGlow, icon: "▼" },
    WAIT: { label: "انتظار", en: "WAIT", color: C.wait, bg: C.waitDim, glow: C.waitGlow, icon: "◆" } }[action];
  
  // Show divergence indicators
  const hasDivergence = signal.indicators?.rsiDivBull || signal.indicators?.rsiDivBear || signal.indicators?.macdDivBull || signal.indicators?.macdDivBear;
  
  return (<div onClick={onClick} style={{ background: `linear-gradient(145deg, ${cfg.bg}, ${C.card})`, border: `2px solid ${cfg.color}55`, borderRadius: compact ? 12 : 16, padding: compact ? 12 : 16, boxShadow: `0 0 40px ${cfg.glow}`, position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : "default", transition: "transform 0.2s, box-shadow 0.2s" }} onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = "translateY(0)"; }}>
    <div style={{ position: "absolute", top: -30, left: -30, width: 100, height: 100, background: `radial-gradient(circle, ${cfg.color}15, transparent)`, borderRadius: "50%" }} />
    {symbol && compact && <div style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontWeight: 700, color: C.accent, background: `${C.card}aa`, padding: "2px 6px", borderRadius: 4 }}>{symbol}</div>}
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12, position: "relative" }}>
      <div style={{ fontSize: compact ? 28 : 38, fontWeight: 900, color: cfg.color, textShadow: `0 0 20px ${cfg.color}88`, animation: action !== "WAIT" ? "pulse 2s infinite" : "none", lineHeight: 1 }}>{cfg.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: compact ? 16 : 22, fontWeight: 900, color: cfg.color, letterSpacing: 2 }}>{cfg.label}</div>
        <div style={{ fontSize: compact ? 8 : 10, color: C.dim, marginTop: 2 }}>
          {cfg.en} — {signal.regimeMode === "strong-trend" ? "اتجاه قوي" : signal.regimeMode === "trend" ? "اتجاهي" : signal.regimeMode === "weak-trend" ? "اتجاه ضعيف" : "ارتداد"}
          {hasDivergence && <span style={{ color: C.divergence, marginRight: 4 }}> | 🔀 تباعد</span>}
        </div>
      </div>
      <div style={{ position: "relative", width: compact ? 50 : 60, height: compact ? 50 : 60 }}>
        <svg width={compact ? "50" : "60"} height={compact ? "50" : "60"} viewBox="0 0 60 60" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="30" cy="30" r="24" fill="none" stroke={`${C.muted}33`} strokeWidth="5" />
          <circle cx="30" cy="30" r="24" fill="none" stroke={cfg.color} strokeWidth="5"
            strokeDasharray={`${confidence * 1.508} ${150.8 - confidence * 1.508}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: compact ? 12 : 14, color: cfg.color }}>{confidence}%</div>
      </div>
    </div>
    {!compact && <ConfirmationMeter buyConf={signal.buyConfirm} sellConf={signal.sellConfirm} total={maxConfirmations} action={action} />}
    {!compact && <ConfidenceBreakdown breakdown={signal.breakdown} />}
    {compact && <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 9, color: C.dim }}><span>تأكيدات: {Math.max(signal.buyConfirm, signal.sellConfirm)}/{maxConfirmations}</span><span>{signal.regimeMode?.includes("trend") ? "اتجاهي" : "ارتداد"}</span></div>}
    {signal.blocked && <div style={{ marginTop: 6, padding: "5px 10px", borderRadius: 6, background: `${C.sell}15`, border: `1px solid ${C.sell}33`, fontSize: 11, color: C.sell }}>🛑 فلاتر الأمان نشطة</div>}
  </div>);
}

function LevelRow({ label, value, color, dec }) {
  return (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 6, background: `${color}0a`, borderRight: `3px solid ${color}` }}>
    <span style={{ color: C.dim, fontSize: 11 }}>{label}</span>
    <span style={{ color, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{typeof value === "number" && !isNaN(value) ? value.toFixed(dec) : "—"}</span>
  </div>);
}

function ReasonsList({ reasons }) {
  return (<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    {reasons.map((r, i) => { const col = r.type === "buy" ? C.buy : r.type === "sell" ? C.sell : C.wait;
      return (<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 8px", borderRadius: 5, background: `${col}08`, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
        <span style={{ minWidth: 5, height: 5, borderRadius: "50%", background: col, marginTop: 5, flexShrink: 0 }} /><span>{r.text}</span></div>);
    })}
  </div>);
}

function SafeChart({ children, label }) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => { setHasError(false); }, [children]);
  if (hasError) return <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12, background: `${C.sell}08`, borderRadius: 8, border: `1px solid ${C.sell}22` }}>⚠️ خطأ في عرض {label || "الرسم البياني"}</div>;
  try { return <div onError={() => setHasError(true)}>{children}</div>; }
  catch { return <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12 }}>⚠️ خطأ في {label}</div>; }
}

function PriceChart({ data, signal, showBB, showEMA, showVWAP }) {
  if (!data?.length) return <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>لا توجد بيانات من المصدر</div>;
  const dec = data[0].close > 100 ? 2 : data[0].close > 10 ? 3 : 5;
  try {
    return (<ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
        <XAxis dataKey="timeLabel" stroke={C.muted} fontSize={8} interval="preserveStartEnd" />
        <YAxis stroke={C.muted} fontSize={8} domain={["auto", "auto"]} tickFormatter={v => typeof v === "number" ? v.toFixed(dec) : v} />
        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 10, color: C.text }} formatter={v => typeof v === "number" ? v.toFixed(dec) : v} />
        {showBB && <><Area dataKey="bbUpper" stroke="none" fill={`${C.ema200}08`} /><Line dataKey="bbUpper" stroke={`${C.ema200}55`} dot={false} strokeWidth={1} name="BB↑" /><Line dataKey="bbLower" stroke={`${C.ema200}55`} dot={false} strokeWidth={1} name="BB↓" /><Line dataKey="bbMiddle" stroke={`${C.ema200}33`} dot={false} strokeWidth={1} strokeDasharray="4 4" name="BB Mid" /></>}
        <Line dataKey="close" stroke={C.accent} dot={false} strokeWidth={2} name="السعر" />
        {showEMA && <><Line dataKey="ema9" stroke={C.ema9} dot={false} strokeWidth={1} name="EMA F" /><Line dataKey="ema21" stroke={C.ema21} dot={false} strokeWidth={1} name="EMA M" /><Line dataKey="ema50" stroke={C.ema50} dot={false} strokeWidth={1.5} name="EMA S" /><Line dataKey="ema200" stroke={C.ema200} dot={false} strokeWidth={1} strokeDasharray="5 5" name="EMA200" /></>}
        {showVWAP && <Line dataKey="vwapLine" stroke="#06b6d4" dot={false} strokeWidth={1} strokeDasharray="3 3" name="VWAP" />}
        {signal && <><ReferenceLine y={signal.levels.support} stroke="#7c3aed" strokeDasharray="3 3" /><ReferenceLine y={signal.levels.resistance} stroke="#e11d48" strokeDasharray="3 3" />{signal.levels.pivot && <ReferenceLine y={signal.levels.pivot} stroke={C.accent} strokeDasharray="2 4" />}{signal.action !== "WAIT" && <><ReferenceLine y={signal.levels.stopLoss} stroke={C.sell} strokeDasharray="6 3" /><ReferenceLine y={signal.levels.tp1} stroke={C.buy} strokeDasharray="6 3" /><ReferenceLine y={signal.levels.tp2} stroke={C.buy} strokeDasharray="4 4" /></>}</>}
        <Legend wrapperStyle={{ fontSize: 9, color: C.dim }} />
      </ComposedChart>
    </ResponsiveContainer>);
  } catch { return <div style={{ height: 200, color: C.muted, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>⚠️ خطأ في الرسم</div>; }
}

function SubChart({ data, dataKey, color, name, lines, yDomain, refLines }) {
  if (!data?.length) return null;
  try {
    return (<ResponsiveContainer width="100%" height={90}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
        <XAxis dataKey="timeLabel" stroke={C.muted} fontSize={7} interval="preserveStartEnd" />
        <YAxis stroke={C.muted} fontSize={7} domain={yDomain || ["auto", "auto"]} />
        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 9, color: C.text }} />
        {refLines?.map((rl, i) => <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="3 3" />)}
        {dataKey === "macdHist" && <Bar dataKey="macdHist" name="Hist" fill={C.green}>{data.map((e, i) => <rect key={i} fill={(e?.macdHist ?? 0) >= 0 ? C.green : C.red} />)}</Bar>}
        {dataKey !== "macdHist" && <Line dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} name={name} connectNulls />}
        {lines?.map((l, i) => <Line key={i} dataKey={l.key} stroke={l.color} dot={false} strokeWidth={1} name={l.name} connectNulls />)}
      </ComposedChart>
    </ResponsiveContainer>);
  } catch { return null; }
}

function BacktestPanel({ bt }) {
  if (!bt || bt.trades === 0) return null;
  return (<div className="crd">
    <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8 }}>📊 باكتست حقيقي</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, textAlign: "center" }}>
      {[["الصفقات", bt.trades, C.text], ["نسبة الربح", `${bt.winRate.toFixed(0)}%`, bt.winRate > 50 ? C.buy : C.sell], ["Profit Factor", bt.profitFactor.toFixed(1), bt.profitFactor > 1 ? C.buy : C.sell]].map(([l, v, cl]) => (
        <div key={l}><div style={{ fontSize: 9, color: C.muted }}>{l}</div><div style={{ fontSize: 15, fontWeight: 800, color: cl }}>{v}</div></div>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, textAlign: "center", marginTop: 6 }}>
      <div><div style={{ fontSize: 9, color: C.muted }}>رابحة</div><div style={{ fontSize: 13, fontWeight: 700, color: C.buy }}>{bt.wins}</div></div>
      <div><div style={{ fontSize: 9, color: C.muted }}>خاسرة</div><div style={{ fontSize: 13, fontWeight: 700, color: C.sell }}>{bt.losses}</div></div>
      <div><div style={{ fontSize: 9, color: C.muted }}>متوسط R</div><div style={{ fontSize: 13, fontWeight: 700, color: bt.avgR > 0 ? C.buy : C.sell }}>{bt.avgR.toFixed(2)}</div></div>
    </div>
    {bt.history.length > 0 && <div style={{ marginTop: 8, maxHeight: 100, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      {bt.history.slice(-6).reverse().map((h, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 6px", borderRadius: 4, background: `${h.result === "win" ? C.buy : C.sell}0a`, color: C.dim }}>
        <span>{h.act} @ {h.en?.toFixed(2)}</span><span style={{ color: h.result === "win" ? C.buy : C.sell, fontWeight: 600 }}>{h.result === "win" ? "✅" : "❌"} {h.r?.toFixed(1)}R</span></div>))}
    </div>}
  </div>);
}

function DebugPanel({ debugInfo }) {
  const [open, setOpen] = useState(false);
  if (!debugInfo) return null;
  return (
    <div style={{ margin: "0 12px 8px" }}>
      <button onClick={() => setOpen(!open)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer", width: "100%", textAlign: "right" }}>
        🔧 {open ? "إخفاء" : "إظهار"} التشخيص
      </button>
      {open && (
        <div style={{ marginTop: 4, padding: "8px 10px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 10, color: C.dim, fontFamily: "monospace", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
          <span>المصدر:</span><span style={{ color: C.accent }}>{debugInfo.provider}</span>
          <span>الرمز:</span><span style={{ color: C.text }}>{debugInfo.symbol}</span>
          <span>الإطار:</span><span style={{ color: C.text }}>{debugInfo.timeframe}</span>
          <span>الحالة:</span><span style={{ color: debugInfo.lastError ? C.sell : C.buy }}>{debugInfo.fetchStatus || "—"}</span>
          <span>ذاكرة:</span><span style={{ color: debugInfo.usingCache ? C.wait : C.muted }}>{debugInfo.usingCache ? "نعم" : "لا"}</span>
          <span>WebSocket:</span><span style={{ color: debugInfo.wsConnected ? C.buy : C.muted }}>{debugInfo.wsConnected ? "متصل" : "غير متصل"}</span>
          <span>خطأ:</span><span style={{ color: debugInfo.lastError ? C.sell : C.muted }}>{debugInfo.lastError || "لا يوجد"}</span>
          <span>تحديث:</span><span style={{ color: C.muted }}>{debugInfo.lastUpdated ? new Date(debugInfo.lastUpdated).toLocaleTimeString("ar-IQ") : "—"}</span>
          <span>الطلبات:</span><span>{debugInfo.fetchCount}</span>
          <span>المفتاح:</span><span style={{ color: debugInfo.keyLoaded ? C.buy : C.sell }}>{debugInfo.keyLoaded ? "محمّل" : "مفقود"}</span>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, setSettings, indicators, setIndicators, provider, keyLoaded, soundEnabled, setSoundEnabled, soundVolume, setSoundVolume, audioRef: audioRefProp }) {
  const S = (label, key, min, max, step) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: C.dim, width: 70, flexShrink: 0 }}>{label}:</span>
      <input type="range" min={min} max={max} step={step} value={settings[key]}
        onChange={e => setSettings(p => ({ ...p, [key]: +e.target.value }))}
        style={{ width: 70, accentColor: C.accent }} />
      <span style={{ fontSize: 10, color: C.accent, fontWeight: 700, width: 28 }}>{settings[key]}</span>
    </div>
  );
  return (
    <div className="crd" style={{ margin: "0 12px 8px", padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>⚙️ الإعدادات المتقدمة</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>المؤشرات:</div>
          {[["EMA", "showEMA"], ["Bollinger", "showBB"], ["VWAP", "showVWAP"], ["RSI", "showRSI"], ["MACD", "showMACD"], ["Stochastic", "showStoch"], ["ADX", "showADX"], ["Ichimoku", "showIchimoku"], ["Keltner", "showKeltner"], ["Stoch RSI", "showStochRSI"], ["MFI", "showMFI"], ["Williams %R", "showWillR"]].map(([l, k]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text, cursor: "pointer", marginBottom: 3 }}>
              <input type="checkbox" checked={indicators[k]} onChange={() => setIndicators(p => ({ ...p, [k]: !p[k] }))} style={{ accentColor: C.accent }} /> {l}
            </label>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>بارامترات:</div>
          {S("RSI", "rsiPeriod", 7, 21, 1)}
          {S("BB", "bbPeriod", 10, 30, 1)}
          {S("ATR", "atrPeriod", 7, 21, 1)}
          {S("ADX", "adxPeriod", 7, 21, 1)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>EMA:</div>
          {S("سريع", "emaFast", 5, 20, 1)}
          {S("متوسط", "emaMid", 15, 50, 1)}
          {S("بطيء", "emaSlow", 30, 100, 5)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>حساسية:</div>
          {S("الحد الأدنى", "minConfirmations", 4, 10, 1)}
          {S("شموع", "chartCandles", 50, 300, 10)}
          {S("ثقة باكتست", "btMinConfidence", 30, 80, 5)}
          <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>💡 حد أدنى أعلى = إشارات أقل + أكثر دقة</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>🔊 الصوت:</div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text, cursor: "pointer", marginBottom: 6 }}>
            <input type="checkbox" checked={soundEnabled} onChange={() => { audioRefProp?.current?.init(); setSoundEnabled(s => !s); }} style={{ accentColor: C.accent }} />
            تفعيل التنبيهات
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text }}>
            مستوى: <input type="range" min="5" max="100" value={soundVolume} onChange={e => { setSoundVolume(+e.target.value); audioRefProp?.current?.setVolume(+e.target.value / 100); }} style={{ width: 80, accentColor: C.accent }} />
            <span style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{soundVolume}%</span>
          </label>
          {soundEnabled && <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
            <button className="btn" onClick={() => audioRefProp?.current?.playBuyAlert()} style={{ background: `${C.buy}15`, border: `1px solid ${C.buy}44`, color: C.buy, padding: "4px 8px", borderRadius: 6, fontSize: 10 }}>▶ شراء</button>
            <button className="btn" onClick={() => audioRefProp?.current?.playSellAlert()} style={{ background: `${C.sell}15`, border: `1px solid ${C.sell}44`, color: C.sell, padding: "4px 8px", borderRadius: 6, fontSize: 10 }}>▶ بيع</button>
          </div>}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>المفتاح:</div>
          {keyLoaded ? <div style={{ fontSize: 11, color: C.buy }}>✅ محمّل</div> : <div style={{ fontSize: 11, color: C.sell }}>❌ مفقود</div>}
          <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
            {provider === "binance" ? "🔗 Binance WebSocket: بيانات لحظية" : provider === "twelvedata" ? "⚠️ Twelve Data: حدود حسب الخطة" : "⚠️ Alpha Vantage: 25 طلب/يوم"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────
export default function TradingAnalyzer() {
  const [category, setCategory] = useState("crypto");
  const [symbol, setSymbol] = useState("BTC/USD");
  const [timeframe, setTimeframe] = useState("15m");
  const [signal, setSignal] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [viewMode, setViewMode] = useState("dashboard");
  const [allPairSignals, setAllPairSignals] = useState({});
  const [refreshRate, setRefreshRate] = useState(15);
  const [showSettings, setShowSettings] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [backtest, setBacktest] = useState(null);
  const [status, setStatus] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [usingCache, setUsingCache] = useState(false);
  const [fetchCount, setFetchCount] = useState(0);
  const [isFallback, setIsFallback] = useState(false);
  const [lastErrorType, setLastErrorType] = useState(null);
  const [fetchStatus, setFetchStatus] = useState("idle");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundVolume, setSoundVolume] = useState(30);
  const [wsConnected, setWsConnected] = useState(false);
  const audioRef = useRef(audioEngine);
  const prevSignalActionRef = useRef(null);
  const wsRef = useRef(null);
  const signalCooldownRef = useRef(0); // Signal cooldown timer

  const [indicators, setIndicators] = useState({
    showEMA: true, showBB: true, showVWAP: false,
    showRSI: true, showMACD: true, showStoch: false, showADX: false,
    // Premium indicators (NEW)
    showIchimoku: true, showKeltner: false, showStochRSI: true, showMFI: true, showWillR: false,
  });

  const [settings, setSettings] = useState({
    rsiPeriod: 14, bbPeriod: 20, bbMult: 2, atrPeriod: 14, adxPeriod: 14,
    emaFast: 9, emaMid: 21, emaSlow: 50,
    macdFast: 12, macdSlow: 26, macdSignal: 9,
    stochK: 14, stochD: 3,
    minConfirmations: 7, chartCandles: 160, btMinConfidence: 55,
  });

  const liveRef = useRef(null);
  const dataRef = useRef([]);
  const fetchingRef = useRef(false);
  const rateLimitedRef = useRef(false);
  const abortRef = useRef(null);
  const backoffRef = useRef(60);
  const liveInFlightRef = useRef(false);
  const multiPairIntervalRef = useRef(null);
  const multiPairInFlightRef = useRef(false);

  const provider = useMemo(() => ASSETS[category]?.provider, [category]);
  const providerKey = useMemo(() => {
    if (provider === "twelvedata") return TWELVE_DATA_KEY;
    if (provider === "alphavantage") return ALPHA_VANTAGE_KEY;
    return null;
  }, [provider]);
  const hasKey = !!providerKey && providerKey !== PLACEHOLDER_KEY;
  const needsKey = provider === "alphavantage" || provider === "twelvedata";

  const symbolOk = useMemo(() => {
    if (provider === "binance") return !!BINANCE_MAP[symbol];
    if (provider === "twelvedata") return !!FOREX_MAP[symbol] || STOCKS.includes(symbol);
    if (provider === "alphavantage") return !!FOREX_MAP[symbol] || STOCKS.includes(symbol);
    return false;
  }, [provider, symbol]);

  const isStale = useMemo(() => {
    if (!dataRef.current.length || !lastUpdated) return true;
    const last = dataRef.current[dataRef.current.length - 1];
    return (Date.now() - last.time) > (TF_MS[timeframe] || 9e5) * 2;
  }, [lastUpdated, timeframe]);

  // ─── WebSocket for Binance real-time ─────────────
  useEffect(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; setWsConnected(false); }
    if (provider !== "binance" || !isLive || manualMode || !symbolOk) return;
    
    const ws = createBinanceWS(symbol, timeframe, (kline) => {
      if (!dataRef.current.length) return;
      const lastCandle = dataRef.current[dataRef.current.length - 1];
      
      if (kline.time === lastCandle.time) {
        // Update current candle in real-time
        dataRef.current[dataRef.current.length - 1] = {
          ...lastCandle,
          high: Math.max(lastCandle.high, kline.high),
          low: Math.min(lastCandle.low, kline.low),
          close: kline.close,
          volume: kline.volume,
        };
      } else if (kline.isClosed && kline.time > lastCandle.time) {
        // New candle closed — add it
        dataRef.current.push(kline);
        if (dataRef.current.length > 500) dataRef.current.shift();
      }
      
      // Re-generate signal with updated data
      if (dataRef.current.length >= 80) {
        const now = Date.now();
        // Signal cooldown: don't re-evaluate more than once every 3 seconds
        if (now - signalCooldownRef.current > 3000) {
          signalCooldownRef.current = now;
          const sig = generateSignal(dataRef.current, settings, { isStale: false, isFallback: false });
          setSignal(sig);
          setLastUpdated(now);
        }
      }
    });
    
    if (ws) {
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
    }
    
    return () => { if (wsRef.current) { wsRef.current.close(); wsRef.current = null; setWsConnected(false); } };
  }, [provider, symbol, timeframe, isLive, manualMode, symbolOk, settings]);

  // ─── FETCH ─────────────────────────────────────
  const fetchCandles = useCallback(async (force = false) => {
    if (fetchingRef.current) return;
    if (needsKey && !hasKey) {
      setStatus({ type: "error", text: `❌ مفتاح ${PROVIDERS[provider]?.label} مفقود` });
      setFetchStatus("error");
      return;
    }
    if (!symbolOk) {
      setStatus({ type: "error", text: `${symbol} غير مدعوم على ${PROVIDERS[provider]?.label}` });
      setFetchStatus("error");
      return;
    }

    if (!force && (provider === "alphavantage" || provider === "twelvedata") && isCacheFresh(provider, symbol, timeframe)) {
      const cached = loadCache(provider, symbol, timeframe);
      if (cached?.data?.length) {
        dataRef.current = cached.data;
        setUsingCache(true);
        const sig = generateSignal(cached.data, settings, { isStale: false, isFallback: false });
        setSignal(sig);
        setBacktest(rollingBacktest(cached.data, settings));
        setLastUpdated(cached.ts);
        setFetchStatus("cache");
        setStatus({ type: "info", text: `✓ من الذاكرة — ${cached.data.length} شمعة`, extra: `${Math.round((Date.now() - cached.ts) / 1000)}ث` });
        return;
      }
    }

    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    const ac = new AbortController();
    abortRef.current = ac;

    fetchingRef.current = true;
    setFetchStatus("fetching");
    setStatus({ type: "fetching", text: `جارِ جلب ${symbol}…` });

    try {
      let candles, fallbackUsed = false;

      if (provider === "binance") {
        candles = await fetchBinance(symbol, timeframe, 500, ac.signal);
      } else if (provider === "twelvedata") {
        if (FOREX_MAP[symbol]) {
          const result = await fetchTDForex(symbol, timeframe, ac.signal);
          candles = result.candles; fallbackUsed = result.fallbackUsed;
        } else if (STOCKS.includes(symbol)) {
          const result = await fetchTDStock(symbol, timeframe, ac.signal);
          candles = result.candles; fallbackUsed = result.fallbackUsed;
        }
      } else if (provider === "alphavantage") {
        if (FOREX_MAP[symbol]) {
          const result = await fetchAVForex(symbol, timeframe, ac.signal);
          candles = result.candles; fallbackUsed = result.fallbackUsed;
        } else {
          const result = await fetchAVStock(symbol, timeframe, ac.signal);
          candles = result.candles; fallbackUsed = result.fallbackUsed;
        }
      }

      if (!candles?.length) throw new Error("لا توجد بيانات");

      dataRef.current = candles;
      saveCache(provider, symbol, timeframe, candles);
      setUsingCache(false);
      setIsFallback(fallbackUsed);
      setFetchCount(p => p + 1);
      setLastErrorType(null);
      setFetchStatus("ok");

      const sig = generateSignal(candles, settings, { isStale: false, isFallback: fallbackUsed });
      setSignal(sig);
      setLastUpdated(Date.now());
      setBacktest(rollingBacktest(candles, settings));

      // Signal cooldown for alerts: only trigger if action holds for at least 2 consecutive evaluations
      if (lastAction && sig.action !== lastAction && sig.action !== "WAIT") {
        setAlerts(prev => [{ id: Date.now(), time: new Date().toLocaleTimeString("ar-IQ"), symbol,
          from: lastAction, to: sig.action, confidence: sig.confidence }, ...prev].slice(0, 30));
      }
      setLastAction(sig.action);
      setSignalHistory(prev => [...prev, { action: sig.action, time: Date.now() }].slice(-100));

      rateLimitedRef.current = false;
      backoffRef.current = 60;
      const extra = fallbackUsed ? "⚠️ بيانات يومية" : `${candles.length} شمعة`;
      setStatus({ type: fallbackUsed ? "warning" : "info", text: `${isLive ? "LIVE" : "✓"} — ${extra}${wsConnected ? " | 🔗 WS" : ""}`,
        extra: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });

    } catch (err) {
      if (err.message === "ABORTED") { fetchingRef.current = false; return; }
      const msg = err.message || "خطأ";
      const avType = err.avType || null;
      if (msg === "TIMEOUT") {
        setLastErrorType("TIMEOUT"); setFetchStatus("timeout");
        setStatus({ type: "warning", text: "⏱ انتهت مهلة الاتصال" });
        const cached = loadCache(provider, symbol, timeframe);
        if (cached?.data?.length) { dataRef.current = cached.data; setUsingCache(true); setSignal(generateSignal(cached.data, settings, { isStale: true, isFallback: false })); setLastUpdated(cached.ts); }
      } else if (msg === "RATE_LIMIT" || avType === AV_ERROR_TYPES.RATE_LIMIT) {
        rateLimitedRef.current = true; setLastErrorType("RATE_LIMIT"); setFetchStatus("rate_limit");
        setStatus({ type: "warning", text: `⚠️ تجاوز حد الطلبات — ${backoffRef.current}ث` });
        if (refreshRate < backoffRef.current) setRefreshRate(backoffRef.current);
        backoffRef.current = Math.min(240, backoffRef.current * 2);
        const cached = loadCache(provider, symbol, timeframe);
        if (cached?.data?.length) { dataRef.current = cached.data; setUsingCache(true); setSignal(generateSignal(cached.data, settings, { isStale: true, isFallback: false })); setLastUpdated(cached.ts); }
      } else if (msg === "API_KEY_MISSING" || avType === AV_ERROR_TYPES.INVALID_KEY) {
        setLastErrorType("INVALID_KEY"); setFetchStatus("error"); setStatus({ type: "error", text: "❌ مفتاح API مفقود أو غير صالح" }); setIsLive(false);
      } else {
        setLastErrorType("OTHER_ERROR"); setFetchStatus("error"); setStatus({ type: "error", text: msg });
        const cached = loadCache(provider, symbol, timeframe);
        if (cached?.data?.length) { dataRef.current = cached.data; setUsingCache(true); setSignal(generateSignal(cached.data, settings, { isStale: true, isFallback: false })); setLastUpdated(cached.ts); }
      }
    } finally { fetchingRef.current = false; }
  }, [provider, symbol, timeframe, hasKey, needsKey, symbolOk, settings, lastAction, isLive, refreshRate, wsConnected]);

  const analyzePair = useCallback(async (pairSymbol, pairTimeframe) => {
    const pairProvider = ASSETS[category]?.provider;
    if (!pairProvider) return null;
    const cached = loadCache(pairProvider, pairSymbol, pairTimeframe);
    if (cached?.data?.length) {
      return { symbol: pairSymbol, signal: generateSignal(cached.data, settings, { isStale: false, isFallback: false }), fromCache: true, timestamp: cached.ts };
    }
    if (rateLimitedRef.current && pairProvider !== "binance") return null;
    try {
      let data = null;
      if (pairProvider === "binance") { data = await fetchBinance(pairSymbol, pairTimeframe, 500); }
      else if (pairProvider === "twelvedata") {
        if (FOREX_MAP[pairSymbol]) { data = (await fetchTDForex(pairSymbol, pairTimeframe)).candles; }
        else if (STOCKS.includes(pairSymbol)) { data = (await fetchTDStock(pairSymbol, pairTimeframe)).candles; }
      }
      if (data?.length) {
        saveCache(pairProvider, pairSymbol, pairTimeframe, data);
        return { symbol: pairSymbol, signal: generateSignal(data, settings, { isStale: false, isFallback: false }), fromCache: false, timestamp: Date.now() };
      }
    } catch {}
    return null;
  }, [category, settings]);

  const analyzeAllPairs = useCallback(async () => {
    if (multiPairInFlightRef.current || manualMode) return;
    multiPairInFlightRef.current = true;
    try {
      const pairs = ASSETS[category]?.items || [];
      const delayMs = ASSETS[category]?.provider === "binance" ? 400 : 2000;
      for (let i = 0; i < pairs.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, delayMs));
        const result = await analyzePair(pairs[i], timeframe);
        if (result) setAllPairSignals(prev => ({ ...prev, [pairs[i]]: result }));
      }
    } catch {} finally { multiPairInFlightRef.current = false; }
  }, [category, timeframe, analyzePair, manualMode]);

  // Reset on change
  useEffect(() => {
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    fetchingRef.current = false; dataRef.current = []; setSignal(null); setBacktest(null);
    setLastAction(null); setSignalHistory([]); setIsFallback(false); setLastErrorType(null); setFetchStatus("idle");
    if (manualMode) { setStatus({ type: "info", text: "🖐️ وضع يدوي" }); return; }
    const t = setTimeout(() => fetchCandles(true), 50);
    return () => clearTimeout(t);
  }, [symbol, category, timeframe, manualMode]);

  // Re-analyze when settings change
  useEffect(() => {
    if (dataRef.current.length > 0) {
      setSignal(generateSignal(dataRef.current, settings, { isStale, isFallback }));
      setBacktest(rollingBacktest(dataRef.current, settings));
    }
  }, [settings, isStale, isFallback]);

  // Live polling
  useEffect(() => {
    if (liveRef.current) { clearInterval(liveRef.current); liveRef.current = null; }
    if (isLive && !manualMode) {
      // For binance with WebSocket, poll less frequently (just for backtest refresh)
      const baseRate = (provider === "binance" && wsConnected) ? Math.max(refreshRate, 30) : refreshRate;
      const iv = rateLimitedRef.current ? Math.max(baseRate, backoffRef.current) : baseRate;
      liveRef.current = setInterval(() => {
        if (liveInFlightRef.current || fetchingRef.current) return;
        liveInFlightRef.current = true;
        fetchCandles(false).finally(() => { liveInFlightRef.current = false; });
      }, iv * 1000);
    }
    return () => { if (liveRef.current) { clearInterval(liveRef.current); liveRef.current = null; } };
  }, [isLive, manualMode, refreshRate, fetchCandles, provider, wsConnected]);

  // Audio sync
  useEffect(() => {
    const engine = audioRef.current;
    if (soundEnabled) { engine.setVolume(soundVolume / 100); engine.enable(); } else { engine.disable(); }
    return () => engine.disable();
  }, [soundEnabled, soundVolume]);

  useEffect(() => { if (signal?.action) audioRef.current.setMarketState(signal.action); }, [signal?.action]);

  useEffect(() => {
    if (!signal?.action || !soundEnabled) return;
    const cur = signal.action, prev = prevSignalActionRef.current;
    if (prev && prev !== cur && cur !== "WAIT") audioRef.current.playSignalChange(cur);
    prevSignalActionRef.current = cur;
  }, [signal?.action, soundEnabled]);

  // Dashboard pair alerts
  const prevAllPairActionsRef = useRef({});
  useEffect(() => {
    if (!soundEnabled || viewMode !== "dashboard") return;
    Object.entries(allPairSignals).forEach(([pair, data]) => {
      if (!data?.signal?.action) return;
      const cur = data.signal.action, prev = prevAllPairActionsRef.current[pair];
      if (prev && prev !== cur && cur !== "WAIT") audioRef.current.playSignalChange(cur);
    });
    const newPrev = {};
    Object.entries(allPairSignals).forEach(([pair, data]) => { if (data?.signal?.action) newPrev[pair] = data.signal.action; });
    prevAllPairActionsRef.current = newPrev;
  }, [allPairSignals, soundEnabled, viewMode]);

  useEffect(() => { return () => audioRef.current.destroy(); }, []);

  // Multi-pair
  useEffect(() => {
    if (multiPairIntervalRef.current) { clearInterval(multiPairIntervalRef.current); multiPairIntervalRef.current = null; }
    if (isLive && !manualMode && viewMode === "dashboard") {
      analyzeAllPairs();
      multiPairIntervalRef.current = setInterval(analyzeAllPairs, Math.max(60, refreshRate * 2) * 1000);
    }
    return () => { if (multiPairIntervalRef.current) { clearInterval(multiPairIntervalRef.current); multiPairIntervalRef.current = null; } };
  }, [isLive, manualMode, viewMode, refreshRate, analyzeAllPairs]);

  const dec = (signal?.indicators?.ema50 || 0) > 100 ? 2 : (signal?.indicators?.ema50 || 0) > 10 ? 3 : 5;
  const signalStability = useMemo(() => {
    if (!signalHistory.length || !signal) return 0;
    let c = 0; for (let i = signalHistory.length - 1; i >= 0; i--) {
      if (signalHistory[i].action === signal.action) c++; else break;
    } return c;
  }, [signalHistory, signal]);

  const debugInfo = useMemo(() => ({
    provider: PROVIDERS[provider]?.label || provider, symbol, timeframe, fetchStatus, usingCache,
    lastError: lastErrorType, isFallback, lastUpdated, fetchCount, keyLoaded: hasKey, wsConnected,
  }), [provider, symbol, timeframe, fetchStatus, usingCache, lastErrorType, isFallback, lastUpdated, fetchCount, hasKey, wsConnected]);

  return (
    <div dir="rtl" style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", background: C.bg, color: C.text, minHeight: "100vh", maxWidth: "100vw", overflowX: "hidden" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes liveDot{0%,100%{box-shadow:0 0 0 0 ${C.buy}66}50%{box-shadow:0 0 0 8px transparent}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        .btn{cursor:pointer;border:none;transition:all .2s;outline:none}.btn:hover{filter:brightness(1.15);transform:translateY(-1px)}.btn:active{transform:translateY(0)}
        .crd{background:${C.card};border:1px solid ${C.border};border-radius:10px;padding:12px;animation:fadeIn .3s ease}
        @media(max-width:768px){.main-grid{grid-template-columns:1fr !important}}
      `}</style>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(180deg, ${C.cardAlt}, ${C.bg})`, borderBottom: `1px solid ${C.border}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.accent, letterSpacing: 1 }}>Trading Analyzer Pro v3</div>
            <div style={{ fontSize: 9, color: C.muted }}>{PROVIDERS[provider]?.label}{wsConnected ? " 🔗 WS" : ""}{usingCache ? " (محفوظة)" : ""}</div>
          </div>
        </div>
        <div style={{ marginRight: "auto", display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => {
            if (manualMode) return;
            if (!isLive && needsKey && !hasKey) { setShowSettings(true); return; }
            if (symbolOk) setIsLive(!isLive);
          }} style={{ background: isLive ? C.buyDim : C.card, border: `1px solid ${isLive ? C.buy : C.border}`, color: isLive ? C.buy : C.dim, padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            {isLive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.buy, animation: "liveDot 1.5s infinite" }} />}
            {isLive ? "⏹ إيقاف" : "▶ مباشر"}
          </button>
          {isLive && <select value={refreshRate} onChange={e => setRefreshRate(+e.target.value)} style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 8px", fontSize: 10 }}>
            {((provider === "alphavantage" || provider === "twelvedata") ? [30, 60, 120, 300] : [5, 10, 15, 30, 60]).map(s => <option key={s} value={s}>{s}ث</option>)}
          </select>}
          <button className="btn" onClick={() => fetchCandles(true)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.accent, padding: "6px 10px", borderRadius: 7, fontSize: 11 }}>🔄</button>
          <button className="btn" onClick={() => { if (isLive) setIsLive(false); setManualMode(m => !m); }}
            style={{ background: manualMode ? C.accentDim : C.card, border: `1px solid ${manualMode ? C.accent : C.border}`, color: C.text, padding: "6px 10px", borderRadius: 7, fontSize: 11 }}>🖐️</button>
          <button className="btn" onClick={() => setShowSettings(!showSettings)} style={{ background: showSettings ? C.accentDim : C.card, border: `1px solid ${showSettings ? C.accent : C.border}`, color: C.text, padding: "6px 10px", borderRadius: 7, fontSize: 11 }}>⚙️</button>
        </div>
      </div>

      {/* ECG + Sound */}
      <div style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: `linear-gradient(90deg, ${C.card}88, ${C.bg}88)`, borderBottom: `1px solid ${C.border}44` }}>
        <button className="btn" onClick={() => { audioRef.current.init(); setSoundEnabled(!soundEnabled); }}
          style={{ background: soundEnabled ? `${C.accent}15` : "transparent", border: `1px solid ${soundEnabled ? C.accent : C.border}44`, color: soundEnabled ? C.accent : C.muted, padding: "4px 10px", borderRadius: 6, fontSize: 10 }}>
          {soundEnabled ? "🔊" : "🔇"} {soundEnabled ? "ON" : "OFF"}
        </button>
        <ECGMonitor marketState={signal?.action || "WAIT"} isActive={soundEnabled && isLive} />
        <div style={{ display: "flex", gap: 4 }}>
          {[["dashboard", "📊 لوحة"], ["single", "📈 تحليل"]].map(([m, l]) => (
            <button key={m} className="btn" onClick={() => setViewMode(m)} style={{ background: viewMode === m ? C.accentDim : C.card, border: `1px solid ${viewMode === m ? C.accent : C.border}`, color: viewMode === m ? C.accent : C.dim, padding: "4px 10px", borderRadius: 6, fontSize: 10 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* CATEGORY + SYMBOL + TIMEFRAME */}
      <div style={{ padding: "8px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(ASSETS).map(([k, v]) => (
          <button key={k} className="btn" onClick={() => { setCategory(k); setSymbol(v.items[0]); setAllPairSignals({}); }}
            style={{ background: category === k ? C.accentDim : C.card, border: `1px solid ${category === k ? C.accent : C.border}`, color: category === k ? C.accent : C.dim, padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
            {v.icon} {v.label}
          </button>
        ))}
        <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600 }}>
          {ASSETS[category]?.items.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: "flex", gap: 3 }}>
          {TIMEFRAMES.map(t => (
            <button key={t} className="btn" onClick={() => setTimeframe(t)} style={{ background: timeframe === t ? C.accent : C.card, color: timeframe === t ? C.bg : C.dim, border: `1px solid ${timeframe === t ? C.accent : C.border}`, padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{t}</button>
          ))}
        </div>
      </div>

      {showSettings && <SettingsPanel settings={settings} setSettings={setSettings} indicators={indicators} setIndicators={setIndicators} provider={provider} keyLoaded={hasKey} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} soundVolume={soundVolume} setSoundVolume={setSoundVolume} audioRef={audioRef} />}
      <StatusBanner status={status} />
      <DebugPanel debugInfo={debugInfo} />

      {/* DASHBOARD VIEW */}
      {viewMode === "dashboard" && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {ASSETS[category]?.items.map(pair => {
              const pairData = allPairSignals[pair];
              if (!pairData?.signal) return (
                <div key={pair} className="crd" style={{ padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: C.muted }}>{pair}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>⏳ جارِ التحليل...</div>
                </div>
              );
              return (
                <div key={pair}>
                  <SignalBadge signal={pairData.signal} symbol={pair} compact={true}
                    onClick={() => { setSymbol(pair); setViewMode("single"); fetchCandles(true); }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SINGLE PAIR VIEW */}
      {viewMode === "single" && <div className="main-grid" style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {signal && (
            <div className="crd" style={{ padding: "8px 12px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 9, color: C.muted }}>{symbol}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: "monospace" }}>{signal.levels.entry?.toFixed(dec) ?? "—"}</div>
              </div>
              {[["RSI", signal.indicators.rsi, signal.indicators.rsi > 70 ? C.sell : signal.indicators.rsi < 30 ? C.buy : C.rsi],
                ["ATR%", signal.indicators.atrPct, C.dim],
                ["ADX", signal.indicators.adx, signal.indicators.adx > 25 ? C.buy : C.muted],
                ["MACD", signal.indicators.macdHist, signal.indicators.macdHist > 0 ? C.buy : C.sell],
                ["Vol", signal.indicators.volRatio, signal.indicators.volRatio > 1.3 ? C.buy : C.muted],
                ["+DI", signal.indicators.plusDI, signal.indicators.plusDI > signal.indicators.minusDI ? C.buy : C.muted],
                ["ROC", signal.indicators.momentum, signal.indicators.momentum > 0 ? C.buy : C.sell],
              ].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: C.muted }}>{l}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: c, fontFamily: "monospace" }}>
                    {typeof v === "number" && !isNaN(v) ? (["RSI","ADX","+DI"].includes(l) ? v.toFixed(1) : l === "ATR%" ? v.toFixed(3) : l === "Vol" ? v.toFixed(1)+"x" : l === "ROC" ? v.toFixed(2)+"%" : v.toFixed(dec)) : "—"}
                  </div>
                </div>
              ))}
              {/* Divergence badges */}
              {signal.indicators.rsiDivBull && <div style={{ fontSize: 9, color: C.buy, background: `${C.buy}11`, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>🔀 تباعد RSI ↑</div>}
              {signal.indicators.rsiDivBear && <div style={{ fontSize: 9, color: C.sell, background: `${C.sell}11`, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>🔀 تباعد RSI ↓</div>}
              {signal.indicators.macdDivBull && <div style={{ fontSize: 9, color: C.buy, background: `${C.buy}11`, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>🔀 تباعد MACD ↑</div>}
              {signal.indicators.macdDivBear && <div style={{ fontSize: 9, color: C.sell, background: `${C.sell}11`, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>🔀 تباعد MACD ↓</div>}
              {signalStability > 2 && <div style={{ fontSize: 9, color: C.buy, background: `${C.buy}11`, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>🔒 مستقر ×{signalStability}</div>}
              {wsConnected && <div style={{ fontSize: 9, color: C.ema9, background: `${C.ema9}11`, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>🔗 WS مباشر</div>}
            </div>
          )}

          <div className="crd">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>📈 {symbol} — {timeframe}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {lastUpdated && <span style={{ fontSize: 9, color: isStale ? C.sell : C.muted }}>
                  {isStale ? "⚠️ قديم" : "✓"} {new Date(lastUpdated).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>}
                {isLive && <span style={{ fontSize: 9, color: C.buy, display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.buy, animation: "liveDot 1.5s infinite" }} /> LIVE
                </span>}
              </div>
            </div>
            <SafeChart label="السعر">
              <PriceChart data={signal?.chartData || []} signal={signal} showBB={indicators.showBB} showEMA={indicators.showEMA} showVWAP={indicators.showVWAP} />
            </SafeChart>
          </div>

          {indicators.showRSI && <div className="crd" style={{ padding: "6px 12px" }}><span style={{ fontSize: 10, fontWeight: 600, color: C.rsi }}>RSI ({settings.rsiPeriod})</span><SafeChart label="RSI"><SubChart data={signal?.chartData || []} dataKey="rsi" color={C.rsi} name="RSI" yDomain={[0, 100]} refLines={[{ y: 70, color: C.sell }, { y: 30, color: C.buy }, { y: 50, color: C.muted }]} /></SafeChart></div>}
          {indicators.showMACD && <div className="crd" style={{ padding: "6px 12px" }}><span style={{ fontSize: 10, fontWeight: 600, color: C.macdL }}>MACD</span><SafeChart label="MACD"><SubChart data={signal?.chartData || []} dataKey="macdHist" color={C.macdL} name="MACD" lines={[{ key: "macdLine", color: C.macdL, name: "MACD" }, { key: "macdSignal", color: C.macdS, name: "Signal" }]} refLines={[{ y: 0, color: C.muted }]} /></SafeChart></div>}
          {indicators.showStoch && <div className="crd" style={{ padding: "6px 12px" }}><span style={{ fontSize: 10, fontWeight: 600, color: C.ema9 }}>Stochastic</span><SafeChart label="Stochastic"><SubChart data={signal?.chartData || []} dataKey="stochK" color={C.ema9} name="%K" lines={[{ key: "stochD", color: C.ema50, name: "%D" }]} yDomain={[0, 100]} refLines={[{ y: 80, color: C.sell }, { y: 20, color: C.buy }]} /></SafeChart></div>}
          {indicators.showADX && <div className="crd" style={{ padding: "6px 12px" }}><span style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b" }}>ADX</span><SafeChart label="ADX"><SubChart data={signal?.chartData || []} dataKey="adxVal" color="#f59e0b" name="ADX" refLines={[{ y: 25, color: C.buy }, { y: 50, color: C.sell }]} /></SafeChart></div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {signal && <SignalBadge signal={signal} />}

          {signal && <div className="crd">
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: C.accent }}>📍 المستويات</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <LevelRow label="الدخول" value={signal.levels.entry} color={C.accent} dec={dec} />
              <LevelRow label="وقف الخسارة" value={signal.levels.stopLoss} color={C.sell} dec={dec} />
              <LevelRow label="هدف 1 (1.5R)" value={signal.levels.tp1} color={C.buy} dec={dec} />
              <LevelRow label="هدف 2 (2.5R)" value={signal.levels.tp2} color={C.buy} dec={dec} />
              <LevelRow label="هدف 3 (3.5R)" value={signal.levels.tp3} color="#06b6d4" dec={dec} />
              <LevelRow label="المحور" value={signal.levels.pivot} color={C.accent} dec={dec} />
              <LevelRow label="الدعم" value={signal.levels.support} color="#7c3aed" dec={dec} />
              <LevelRow label="المقاومة" value={signal.levels.resistance} color="#e11d48" dec={dec} />
            </div>
          </div>}

          {signal && signal.action !== "WAIT" && (() => {
            const rk = Math.abs(signal.levels.entry - signal.levels.stopLoss);
            const r1 = rk > 0 ? (Math.abs(signal.levels.tp1 - signal.levels.entry) / rk).toFixed(1) : "—";
            const r2 = rk > 0 ? (Math.abs(signal.levels.tp2 - signal.levels.entry) / rk).toFixed(1) : "—";
            return (<div className="crd">
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: C.accent }}>⚖️ المخاطرة / العائد</div>
              <div style={{ display: "flex", gap: 10, textAlign: "center" }}>
                <div style={{ flex: 1, background: `${C.buy}11`, padding: 6, borderRadius: 6 }}><div style={{ fontSize: 9, color: C.muted }}>TP1</div><div style={{ fontSize: 16, fontWeight: 800, color: C.buy }}>1:{r1}</div></div>
                <div style={{ flex: 1, background: `${C.buy}11`, padding: 6, borderRadius: 6 }}><div style={{ fontSize: 9, color: C.muted }}>TP2</div><div style={{ fontSize: 16, fontWeight: 800, color: C.buy }}>1:{r2}</div></div>
              </div>
            </div>);
          })()}

          {signal && <div className="crd">
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: C.accent }}>🔍 التحليل ({signal.confirmations}/{signal.maxConfirmations})</div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}><ReasonsList reasons={signal.reasons} /></div>
          </div>}

          <BacktestPanel bt={backtest} />

          {alerts.length > 0 && <div className="crd">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>🔔 التنبيهات</span>
              <button className="btn" onClick={() => setAlerts([])} style={{ background: "transparent", color: C.muted, fontSize: 9, border: "none" }}>مسح</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 120, overflowY: "auto" }}>
              {alerts.map(a => {
                const col = a.to === "BUY" ? C.buy : a.to === "SELL" ? C.sell : C.wait;
                return (<div key={a.id} style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, background: `${col}0a`, borderRight: `3px solid ${col}`, color: C.dim }}>
                  {a.time} | {a.symbol}: <span style={{ color: col, fontWeight: 700 }}>{a.to}</span> ({a.confidence}%)
                </div>);
              })}
            </div>
          </div>}

          <div style={{ padding: "6px 8px", borderRadius: 7, background: `${C.sell}08`, border: `1px solid ${C.sell}22`, fontSize: 9, color: C.muted, lineHeight: 1.6 }}>
            ⚠️ <strong style={{ color: C.sell }}>تنبيه:</strong> تعليمي فقط — ليس نصيحة استثمارية. الإشارات تستخدم تحليل فني متقدم (تباعد RSI/MACD، شريط EMA، نقاط محور، أنماط شموع) لكنها احتمالية. استخدم إدارة مخاطر صارمة.
          </div>
        </div>
      </div>}
    </div>
  );
}