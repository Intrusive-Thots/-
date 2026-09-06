import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { SSHConfig, SystemMetricPoint } from '../types';
import {
  Activity,
  Cpu,
  Layers,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Trash2,
  Download,
  AlertTriangle,
  Zap,
  Gauge,
  Sliders,
  ChevronDown,
} from 'lucide-react';

interface SystemMetricsWidgetProps {
  config: SSHConfig;
  useSimulation: boolean;
  onExecuteCommand?: (cmd: string) => void;
  className?: string;
}

type MetricViewMode = 'all' | 'cpu' | 'memory';

export const SystemMetricsWidget: React.FC<SystemMetricsWidgetProps> = ({
  config,
  useSimulation,
  className = '',
}) => {
  // Chart and Container refs
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Widget States
  const [metrics, setMetrics] = useState<SystemMetricPoint[]>(() => {
    // Pre-populate with realistic initial baseline so the chart is immediately rich and readable
    const initial: SystemMetricPoint[] = [];
    const now = Date.now();
    const count = 24;
    let baseCpu = 22;
    let baseMem = 118;

    for (let i = count - 1; i >= 0; i--) {
      const ts = now - i * 2000;
      baseCpu = Math.max(8, Math.min(85, Math.round(baseCpu + (Math.random() - 0.48) * 6)));
      baseMem = Math.max(95, Math.min(160, Math.round(baseMem + (Math.random() - 0.5) * 2)));
      const memTotal = 256;
      const memPercent = Math.round((baseMem / memTotal) * 100);
      const timeLabel = new Date(ts).toTimeString().split(' ')[0];
      const load1 = Number(((baseCpu / 100) * 0.85).toFixed(2));
      const load5 = Number((load1 * 0.9 + 0.05).toFixed(2));

      initial.push({
        timestamp: ts,
        timeLabel,
        cpuPercent: baseCpu,
        memPercent,
        memUsedMb: baseMem,
        memTotalMb: memTotal,
        memFreeMb: memTotal - baseMem,
        load1,
        load5,
        load15: 0.18,
      });
    }
    return initial;
  });

  const [isLive, setIsLive] = useState<boolean>(true);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(2000);
  const [viewMode, setViewMode] = useState<MetricViewMode>('all');
  const [maxHistoryPoints, setMaxHistoryPoints] = useState<number>(40);
  const [latencyMs, setLatencyMs] = useState<number | null>(32);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [telemetryMode, setTelemetryMode] = useState<'live' | 'simulated' | 'fallback'>('simulated');
  const [hoveredPoint, setHoveredPoint] = useState<SystemMetricPoint | null>(null);
  const [showThresholdNotice, setShowThresholdNotice] = useState<boolean>(false);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 600,
    height: 280,
  });

  // Calculate live statistics
  const currentMetric = metrics[metrics.length - 1];

  const statsSummary = useMemo(() => {
    if (metrics.length === 0) {
      return {
        cpuCurrent: 0,
        cpuMin: 0,
        cpuMax: 0,
        cpuAvg: 0,
        memCurrent: 0,
        memMin: 0,
        memMax: 0,
        memAvg: 0,
        peakCpuTime: '',
      };
    }

    let cpuSum = 0;
    let cpuMin = 100;
    let cpuMax = 0;
    let memSum = 0;
    let memMin = 100;
    let memMax = 0;
    let peakCpuTime = '';

    metrics.forEach((m) => {
      cpuSum += m.cpuPercent;
      if (m.cpuPercent < cpuMin) cpuMin = m.cpuPercent;
      if (m.cpuPercent > cpuMax) {
        cpuMax = m.cpuPercent;
        peakCpuTime = m.timeLabel;
      }

      memSum += m.memPercent;
      if (m.memPercent < memMin) memMin = m.memPercent;
      if (m.memPercent > memMax) memMax = m.memPercent;
    });

    const count = metrics.length;
    return {
      cpuCurrent: currentMetric?.cpuPercent ?? 0,
      cpuMin: Math.round(cpuMin),
      cpuMax: Math.round(cpuMax),
      cpuAvg: Math.round(cpuSum / count),
      memCurrent: currentMetric?.memPercent ?? 0,
      memMin: Math.round(memMin),
      memMax: Math.round(memMax),
      memAvg: Math.round(memSum / count),
      peakCpuTime,
    };
  }, [metrics, currentMetric]);

  // Fetch telemetry metric from backend
  const fetchMetric = useCallback(async () => {
    if (isPolling) return;
    setIsPolling(true);
    const start = performance.now();

    try {
      const response = await fetch('/api/ssh/system-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, useSimulation }),
      });

      const data = await response.json();
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      if (data.success && data.metric) {
        setTelemetryMode(data.mode || (useSimulation ? 'simulated' : 'live'));
        setMetrics((prev) => {
          const next = [...prev, data.metric];
          if (next.length > maxHistoryPoints) {
            return next.slice(next.length - maxHistoryPoints);
          }
          return next;
        });

        if (data.metric.cpuPercent >= 80 || data.metric.memPercent >= 85) {
          setShowThresholdNotice(true);
        } else {
          setShowThresholdNotice(false);
        }
      }
    } catch (err) {
      console.warn('Telemetry poll request failed:', err);
    } finally {
      setIsPolling(false);
    }
  }, [config, useSimulation, maxHistoryPoints, isPolling]);

  // ResizeObserver for responsive D3 canvas
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setContainerDimensions({
            width: Math.floor(width),
            height: 290,
          });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Polling loop
  useEffect(() => {
    if (!isLive) return;

    const timer = setInterval(() => {
      fetchMetric();
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [isLive, pollIntervalMs, fetchMetric]);

  // D3 Chart Rendering Engine
  useEffect(() => {
    if (!svgRef.current || metrics.length < 2) return;

    let rafId: number;

    rafId = requestAnimationFrame(() => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);
      const { width, height } = containerDimensions;

      const margin = { top: 20, right: 28, bottom: 35, left: 45 };
      const innerWidth = Math.max(10, width - margin.left - margin.right);
      const innerHeight = Math.max(10, height - margin.top - margin.bottom);

      // Clear previous elements
      svg.selectAll('*').remove();

      // Setup defs & gradients
      const defs = svg.append('defs');

      // CPU Area Gradient (Amber / Golden Tactical)
      const cpuGrad = defs
        .append('linearGradient')
        .attr('id', 'cpu-area-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      cpuGrad.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.4);
      cpuGrad.append('stop').attr('offset', '70%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.08);
      cpuGrad.append('stop').attr('offset', '100%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0);

      // Memory Area Gradient (Cyan / Neon Hak5)
      const memGrad = defs
        .append('linearGradient')
        .attr('id', 'mem-area-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      memGrad.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.35);
      memGrad.append('stop').attr('offset', '70%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.06);
      memGrad.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0);

      // Drop shadow filter for active point
      const filter = defs.append('filter').attr('id', 'glow-filter').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
      const feMerge = filter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'coloredBlur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      // Scales
      const timeExtent = d3.extent(metrics, (d: SystemMetricPoint) => new Date(d.timestamp));
      const xScale = d3
        .scaleTime()
        .domain(timeExtent[0] && timeExtent[1] ? [timeExtent[0], timeExtent[1]] : [new Date(), new Date()])
        .range([margin.left, margin.left + innerWidth]);

      const yScale = d3.scaleLinear().domain([0, 100]).range([margin.top + innerHeight, margin.top]);

      const g = svg.append('g');

      // Gridlines (Horizontal 25%, 50%, 75%, 100%)
      const yGridValues = [25, 50, 75, 100];
      g.append('g')
        .attr('class', 'grid-lines')
        .selectAll('line')
        .data(yGridValues)
        .enter()
        .append('line')
        .attr('x1', margin.left)
        .attr('x2', margin.left + innerWidth)
        .attr('y1', (d) => yScale(d))
        .attr('y2', (d) => yScale(d))
        .attr('stroke', '#1e293b')
        .attr('stroke-dasharray', '3,3')
        .attr('stroke-width', 1);

      // 80% Critical Threshold Accent Line
      g.append('line')
        .attr('x1', margin.left)
        .attr('x2', margin.left + innerWidth)
        .attr('y1', yScale(80))
        .attr('y2', yScale(80))
        .attr('stroke', '#ef4444')
        .attr('stroke-dasharray', '4,4')
        .attr('stroke-opacity', 0.45)
        .attr('stroke-width', 1.2);

      g.append('text')
        .attr('x', margin.left + innerWidth - 6)
        .attr('y', yScale(80) - 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#ef4444')
        .attr('font-size', '9px')
        .attr('font-family', 'monospace')
        .attr('opacity', 0.75)
        .text('80% High Load');

      // Area Generators
      const cpuArea = d3
        .area<SystemMetricPoint>()
        .x((d) => xScale(new Date(d.timestamp)))
        .y0(yScale(0))
        .y1((d) => yScale(d.cpuPercent))
        .curve(d3.curveMonotoneX);

      const memArea = d3
        .area<SystemMetricPoint>()
        .x((d) => xScale(new Date(d.timestamp)))
        .y0(yScale(0))
        .y1((d) => yScale(d.memPercent))
        .curve(d3.curveMonotoneX);

      // Line Generators
      const cpuLine = d3
        .line<SystemMetricPoint>()
        .x((d) => xScale(new Date(d.timestamp)))
        .y((d) => yScale(d.cpuPercent))
        .curve(d3.curveMonotoneX);

      const memLine = d3
        .line<SystemMetricPoint>()
        .x((d) => xScale(new Date(d.timestamp)))
        .y((d) => yScale(d.memPercent))
        .curve(d3.curveMonotoneX);

      // Draw Memory Layer First (if visible)
      if (viewMode === 'all' || viewMode === 'memory') {
        g.append('path')
          .datum(metrics)
          .attr('fill', 'url(#mem-area-gradient)')
          .attr('d', memArea);

        g.append('path')
          .datum(metrics)
          .attr('fill', 'none')
          .attr('stroke', '#06b6d4')
          .attr('stroke-width', 2.2)
          .attr('d', memLine);
      }

      // Draw CPU Layer (if visible)
      if (viewMode === 'all' || viewMode === 'cpu') {
        g.append('path')
          .datum(metrics)
          .attr('fill', 'url(#cpu-area-gradient)')
          .attr('d', cpuArea);

        g.append('path')
          .datum(metrics)
          .attr('fill', 'none')
          .attr('stroke', '#f59e0b')
          .attr('stroke-width', 2.2)
          .attr('d', cpuLine);
      }

      // Axes
      const xAxis = d3
        .axisBottom(xScale)
        .ticks(Math.max(3, Math.floor(innerWidth / 85)))
        .tickFormat((d) => d3.timeFormat('%H:%M:%S')(d as Date))
        .tickSizeOuter(0);

      const yAxis = d3
        .axisLeft(yScale)
        .tickValues([0, 25, 50, 75, 100])
        .tickFormat((d) => `${d}%`)
        .tickSizeOuter(0);

      // X Axis group
      const gx = g
        .append('g')
        .attr('transform', `translate(0, ${margin.top + innerHeight})`)
        .call(xAxis);

      gx.select('.domain').attr('stroke', '#334155');
      gx.selectAll('.tick line').attr('stroke', '#334155');
      gx.selectAll('.tick text')
        .attr('fill', '#94a3b8')
        .attr('font-size', '10px')
        .attr('font-family', 'monospace')
        .attr('dy', '10px');

      // Y Axis group
      const gy = g
        .append('g')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(yAxis);

      gy.select('.domain').attr('stroke', '#334155');
      gy.selectAll('.tick line').attr('stroke', '#334155');
      gy.selectAll('.tick text')
        .attr('fill', '#94a3b8')
        .attr('font-size', '10px')
        .attr('font-family', 'monospace');

      // Pulsing Latest Points
      const latest = metrics[metrics.length - 1];
      if (latest) {
        const latestX = xScale(new Date(latest.timestamp));

        // Latest Memory point
        if (viewMode === 'all' || viewMode === 'memory') {
          const latestMemY = yScale(latest.memPercent);
          g.append('circle')
            .attr('cx', latestX)
            .attr('cy', latestMemY)
            .attr('r', 4.5)
            .attr('fill', '#06b6d4')
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 2)
            .attr('filter', 'url(#glow-filter)');

          g.append('circle')
            .attr('cx', latestX)
            .attr('cy', latestMemY)
            .attr('r', 8)
            .attr('fill', 'none')
            .attr('stroke', '#06b6d4')
            .attr('stroke-width', 1.2)
            .attr('opacity', 0.6)
            .attr('class', 'animate-ping');
        }

        // Latest CPU point
        if (viewMode === 'all' || viewMode === 'cpu') {
          const latestCpuY = yScale(latest.cpuPercent);
          g.append('circle')
            .attr('cx', latestX)
            .attr('cy', latestCpuY)
            .attr('r', 4.5)
            .attr('fill', '#f59e0b')
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 2)
            .attr('filter', 'url(#glow-filter)');

          g.append('circle')
            .attr('cx', latestX)
            .attr('cy', latestCpuY)
            .attr('r', 8)
            .attr('fill', 'none')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 1.2)
            .attr('opacity', 0.6)
            .attr('class', 'animate-ping');
        }
      }

      // Hover Elements (Crosshair & Points)
      const hoverGroup = g.append('g').attr('class', 'hover-elements').style('display', 'none');

      const crosshair = hoverGroup
        .append('line')
        .attr('class', 'crosshair-line')
        .attr('y1', margin.top)
        .attr('y2', margin.top + innerHeight)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');

      const cpuHoverDot = hoverGroup
        .append('circle')
        .attr('r', 5)
        .attr('fill', '#f59e0b')
        .attr('stroke', '#020617')
        .attr('stroke-width', 2.5);

      const memHoverDot = hoverGroup
        .append('circle')
        .attr('r', 5)
        .attr('fill', '#06b6d4')
        .attr('stroke', '#020617')
        .attr('stroke-width', 2.5);

      // Bisector for interactive mouse tracking
      const bisect = d3.bisector<SystemMetricPoint, Date>((d) => new Date(d.timestamp)).center;

      // Overlay Rect for capture
      svg
        .append('rect')
        .attr('class', 'overlay')
        .attr('x', margin.left)
        .attr('y', margin.top)
        .attr('width', innerWidth)
        .attr('height', innerHeight)
        .attr('fill', 'transparent')
        .attr('cursor', 'crosshair')
        .on('pointermove', function (event) {
          const [mx] = d3.pointer(event);
          const hoveredDate = xScale.invert(mx);
          const index = bisect(metrics, hoveredDate);
          const point = metrics[index];

          if (!point) return;

          setHoveredPoint(point);
          const px = xScale(new Date(point.timestamp));
          const pyCpu = yScale(point.cpuPercent);
          const pyMem = yScale(point.memPercent);

          hoverGroup.style('display', null);
          crosshair.attr('x1', px).attr('x2', px);

          if (viewMode === 'all' || viewMode === 'cpu') {
            cpuHoverDot.style('display', null).attr('cx', px).attr('cy', pyCpu);
          } else {
            cpuHoverDot.style('display', 'none');
          }

          if (viewMode === 'all' || viewMode === 'memory') {
            memHoverDot.style('display', null).attr('cx', px).attr('cy', pyMem);
          } else {
            memHoverDot.style('display', 'none');
          }
        })
        .on('pointerleave', function () {
          hoverGroup.style('display', 'none');
          setHoveredPoint(null);
        });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [metrics, containerDimensions, viewMode]);

  // Export current metrics buffer as JSON
  const handleExportData = () => {
    const jsonStr = JSON.stringify(metrics, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pineapple_metrics_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    if (metrics.length > 0) {
      // Keep just the last point
      setMetrics([metrics[metrics.length - 1]]);
    }
  };

  return (
    <div
      id="system-metrics-widget"
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden transition-all ${className}`}
    >
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-amber-500/30 text-amber-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>WiFi Pineapple Telemetry</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  D3.js Live
                </span>
              </h3>
              {telemetryMode === 'live' ? (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  SSH Live
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-800/80 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Simulated Stream
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Real-time CPU and Memory usage statistics streamed from OpenWrt kernel
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Filter (Both / CPU / RAM) */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                viewMode === 'all'
                  ? 'bg-slate-800 text-slate-100 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Both
            </button>
            <button
              onClick={() => setViewMode('cpu')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                viewMode === 'cpu'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              CPU
            </button>
            <button
              onClick={() => setViewMode('memory')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                viewMode === 'memory'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'text-slate-400 hover:text-cyan-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              RAM
            </button>
          </div>

          {/* Polling Interval Select */}
          <div className="flex items-center bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={pollIntervalMs}
              onChange={(e) => setPollIntervalMs(Number(e.target.value))}
              className="bg-transparent border-none focus:outline-none text-xs text-slate-200 cursor-pointer"
            >
              <option value={1000} className="bg-slate-900 text-slate-200">
                1.0s rate
              </option>
              <option value={2000} className="bg-slate-900 text-slate-200">
                2.0s rate
              </option>
              <option value={5000} className="bg-slate-900 text-slate-200">
                5.0s rate
              </option>
              <option value={10000} className="bg-slate-900 text-slate-200">
                10.0s rate
              </option>
            </select>
          </div>

          {/* Play / Pause Toggle */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
              isLive
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
            title={isLive ? 'Pause real-time stream' : 'Resume real-time stream'}
          >
            {isLive ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span className="hidden sm:inline">{isLive ? 'Live' : 'Paused'}</span>
          </button>

          {/* Manual Refresh button */}
          <button
            onClick={() => fetchMetric()}
            disabled={isPolling}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
            title="Poll now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Clear & Export buttons */}
          <button
            onClick={handleClearHistory}
            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 transition-colors"
            title="Reset telemetry buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleExportData}
            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 rounded-xl border border-slate-800 transition-colors"
            title="Export metrics JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Real-Time Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 my-4 relative z-10">
        {/* CPU Usage Card */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              CPU Utilization
            </span>
            <span className="text-[10px] font-mono text-amber-400 font-semibold">
              Peak: {statsSummary.cpuMax}%
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-slate-100 flex items-baseline gap-1">
              <span>{statsSummary.cpuCurrent}</span>
              <span className="text-xs text-slate-500 font-normal">%</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Avg: <span className="text-slate-200">{statsSummary.cpuAvg}%</span>
            </div>
          </div>

          {/* Progress gauge bar */}
          <div className="w-full bg-slate-800/80 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                statsSummary.cpuCurrent >= 80
                  ? 'bg-rose-500'
                  : statsSummary.cpuCurrent >= 50
                  ? 'bg-amber-400'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, statsSummary.cpuCurrent))}%` }}
            />
          </div>
        </div>

        {/* Load Average Card */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-300" />
              Load Averages
            </span>
            <span className="text-[10px] font-mono text-slate-500">1m · 5m · 15m</span>
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
              <span className="text-amber-400">{currentMetric?.load1 ?? 0.18}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300">{currentMetric?.load5 ?? 0.22}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{currentMetric?.load15 ?? 0.15}</span>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 mt-2 flex items-center justify-between">
            <span>Kernel: MIPS OpenWrt</span>
            <span className="text-emerald-400">Nominal</span>
          </div>
        </div>

        {/* Memory RAM Card */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Memory (RAM)
            </span>
            <span className="text-[10px] font-mono text-cyan-400 font-semibold">
              {statsSummary.memCurrent}%
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-base font-bold font-mono text-slate-100 flex items-baseline gap-1">
              <span>{currentMetric?.memUsedMb ?? 118}</span>
              <span className="text-xs text-slate-400 font-normal">/ {currentMetric?.memTotalMb ?? 256} MB</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Free: <span className="text-cyan-300">{currentMetric?.memFreeMb ?? 138}MB</span>
            </div>
          </div>

          {/* Progress gauge bar */}
          <div className="w-full bg-slate-800/80 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                statsSummary.memCurrent >= 85 ? 'bg-rose-500' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, statsSummary.memCurrent))}%` }}
            />
          </div>
        </div>

        {/* Telemetry Buffer & Latency Card */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Telemetry Link
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-semibold">
              {latencyMs ? `${latencyMs}ms` : 'Ready'}
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-sm font-bold font-mono text-slate-200">
              {metrics.length} <span className="text-xs text-slate-400 font-normal">samples cached</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Window: <span className="text-slate-200">{Math.round((metrics.length * pollIntervalMs) / 1000)}s</span>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 mt-2 flex items-center justify-between">
            <span>Protocol: SSH/procfs</span>
            <span className="text-slate-300">{config.host}:{config.port}</span>
          </div>
        </div>
      </div>

      {/* Threshold Warning Banner if load is unusually high */}
      {showThresholdNotice && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center justify-between text-xs font-mono text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>High Device Resource Load Detected (&gt;80%). Consider throttling active payloads or rogue AP beacon frequencies.</span>
          </div>
          <button
            onClick={() => setShowThresholdNotice(false)}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* D3 Real-Time Chart Canvas Container */}
      <div className="relative">
        <div
          ref={containerRef}
          className="w-full h-[290px] bg-slate-950/80 rounded-xl border border-slate-800/90 relative overflow-hidden"
        >
          <svg
            ref={svgRef}
            width={containerDimensions.width}
            height={containerDimensions.height}
            className="w-full h-full block"
          />

          {/* Interactive Inspection HUD Hover Overlay */}
          {hoveredPoint && (
            <div
              ref={tooltipRef}
              className="absolute top-3 right-3 bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md pointer-events-none text-xs font-mono z-20 space-y-1.5 min-w-[210px]"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-[10px] text-slate-400">
                <span>TIME SNAPSHOT</span>
                <span className="text-slate-200 font-bold">{hoveredPoint.timeLabel}</span>
              </div>

              <div className="flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  CPU Load:
                </span>
                <span className="font-bold text-amber-400">{hoveredPoint.cpuPercent}%</span>
              </div>

              <div className="flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  Memory (RAM):
                </span>
                <span className="font-bold text-cyan-400">
                  {hoveredPoint.memPercent}% ({hoveredPoint.memUsedMb}MB)
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                <span>1m/5m Load:</span>
                <span className="text-slate-300">
                  {hoveredPoint.load1} / {hoveredPoint.load5}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>RAM Available:</span>
                <span className="text-emerald-400">{hoveredPoint.memFreeMb} MB Free</span>
              </div>
            </div>
          )}
        </div>

        {/* Legend & Scale Annotations beneath chart */}
        <div className="mt-3 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 px-1 gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-amber-400 rounded-full" />
              <span className="text-slate-300 font-medium">CPU Usage (%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-cyan-400 rounded-full" />
              <span className="text-slate-300 font-medium">RAM Allocation (%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 border-t border-dashed border-rose-500" />
              <span className="text-rose-400 text-[11px]">80% High Load Threshold</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>Hover chart to inspect instantaneous values</span>
            <span>·</span>
            <span>Max Buffer: {maxHistoryPoints} pts</span>
          </div>
        </div>
      </div>
    </div>
  );
};
