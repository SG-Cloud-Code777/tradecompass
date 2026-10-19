import { sma, type Bar } from '@tradecompass/signals';
import { ColorType, createChart, LineStyle, type IChartApi, type Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

interface Props {
  bars: Bar[];
  levels?: { price: number; title: string; color: string }[];
  height?: number;
}

const isDark = () => document.documentElement.classList.contains('dark');

/** Candles + 50/200-day MAs + volume, with optional horizontal levels (entry, stop, targets). */
export function PriceChart({ bars, levels = [], height = 300 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!el.current || !bars.length) return;
    const dark = isDark();
    const chart = createChart(el.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: dark ? '#94a3b8' : '#475569', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? '#1e293b' : '#e2e8f0' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      handleScroll: { vertTouchDrag: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    const time = (b: Bar) => b.t as Time;
    const candles = chart.addCandlestickSeries({
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });
    candles.setData(bars.map((b) => ({ time: time(b), open: b.o, high: b.h, low: b.l, close: b.c })));
    const closes = bars.map((b) => b.c);
    const line = (period: number, color: string, title: string) => {
      const s = chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title });
      const vals = sma(closes, period);
      s.setData(bars.flatMap((b, i) => (vals[i] == null ? [] : [{ time: time(b), value: vals[i] as number }])));
    };
    line(50, '#38bdf8', 'MA50');
    line(200, '#a78bfa', 'MA200');
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b, i) => ({ time: time(b), value: b.v, color: i && b.c < bars[i - 1].c ? '#dc262655' : '#16a34a55' })));
    for (const l of levels) candles.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title });
    // show ~ the last 9 months by default
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 190), to: bars.length + 3 });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.current!.clientWidth }));
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [bars, levels, height]);

  return <div ref={el} className="w-full" style={{ height }} aria-label="Price chart with 50- and 200-day moving averages and volume" role="img" />;
}
