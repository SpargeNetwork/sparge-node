(function initTransactionChart(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeTransactionChart = api;
})(typeof window !== 'undefined' ? window : null, function transactionChartFactory() {
  const PADDING = Object.freeze({ top: 20, right: 18, bottom: 28, left: 42 });

  function buildChartGeometry(series, width, height) {
    const values = Array.isArray(series) ? series : [];
    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom);
    const maxCount = Math.max(1, ...values.map((point) => Number(point.count) || 0));
    const denominator = Math.max(1, values.length - 1);
    return {
      maxCount,
      points: values.map((point, index) => ({
        x: PADDING.left + ((index / denominator) * plotWidth),
        y: PADDING.top + plotHeight - (((Number(point.count) || 0) / maxCount) * plotHeight),
        count: Number(point.count) || 0,
        timestamp: point.timestamp
      }))
    };
  }

  function nearestPointIndex(points, x) {
    if (!Array.isArray(points) || !points.length) return -1;
    let nearest = 0;
    let distance = Math.abs(points[0].x - x);
    for (let index = 1; index < points.length; index += 1) {
      const candidate = Math.abs(points[index].x - x);
      if (candidate < distance) {
        nearest = index;
        distance = candidate;
      }
    }
    return nearest;
  }

  function formatAxisDate(timestamp, range) {
    const date = new Date(timestamp);
    if (range === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatTooltipDate(timestamp, range) {
    const date = new Date(timestamp);
    const options = range === '24h'
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' };
    return date.toLocaleString([], options);
  }

  function createChart({ container, canvas, tooltip }) {
    if (!container || !canvas) return null;
    const context = canvas.getContext('2d');
    let series = [];
    let range = '24h';
    let geometry = { points: [], maxCount: 1 };
    let activeIndex = -1;

    function canvasSize() {
      const rect = container.getBoundingClientRect();
      return { width: Math.max(320, Math.floor(rect.width)), height: Math.max(260, Math.floor(rect.height)) };
    }

    function linePath(points) {
      if (!points.length) return;
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const point = points[index];
        const midpoint = (previous.x + point.x) / 2;
        context.bezierCurveTo(midpoint, previous.y, midpoint, point.y, point.x, point.y);
      }
    }

    function draw() {
      const { width, height } = canvasSize();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      geometry = buildChartGeometry(series, width, height);

      context.font = '11px Space Grotesk, system-ui, sans-serif';
      context.fillStyle = '#8fa9a2';
      context.strokeStyle = 'rgba(168, 194, 187, 0.14)';
      context.lineWidth = 1;
      for (let step = 0; step <= 3; step += 1) {
        const y = PADDING.top + ((height - PADDING.top - PADDING.bottom) * (step / 3));
        context.beginPath();
        context.moveTo(PADDING.left, y);
        context.lineTo(width - PADDING.right, y);
        context.stroke();
        const value = Math.round(geometry.maxCount * (1 - (step / 3)));
        context.fillText(value.toLocaleString(), 4, y + 4);
      }

      const labelIndexes = [0, Math.floor((series.length - 1) / 2), series.length - 1]
        .filter((value, index, values) => value >= 0 && values.indexOf(value) === index);
      context.textAlign = 'center';
      for (const index of labelIndexes) {
        const point = geometry.points[index];
        context.fillText(formatAxisDate(point.timestamp, range), point.x, height - 7);
      }
      context.textAlign = 'start';

      if (!geometry.points.length) return;
      linePath(geometry.points);
      context.lineTo(geometry.points[geometry.points.length - 1].x, height - PADDING.bottom);
      context.lineTo(geometry.points[0].x, height - PADDING.bottom);
      context.closePath();
      context.fillStyle = 'rgba(43, 182, 115, 0.12)';
      context.fill();

      linePath(geometry.points);
      context.strokeStyle = '#2bb673';
      context.lineWidth = 2;
      context.stroke();

      if (activeIndex >= 0 && geometry.points[activeIndex]) {
        const point = geometry.points[activeIndex];
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fillStyle = '#e6f4ef';
        context.fill();
        context.strokeStyle = '#2bb673';
        context.lineWidth = 2;
        context.stroke();
      }
    }

    function hideTooltip() {
      activeIndex = -1;
      if (tooltip) tooltip.hidden = true;
      draw();
    }

    function showTooltip(event) {
      if (!geometry.points.length || !tooltip) return;
      const rect = canvas.getBoundingClientRect();
      const index = nearestPointIndex(geometry.points, event.clientX - rect.left);
      const point = geometry.points[index];
      activeIndex = index;
      tooltip.innerHTML = `<strong>${formatTooltipDate(point.timestamp, range)}</strong><span>${point.count.toLocaleString()} transactions</span>`;
      tooltip.hidden = false;
      const left = Math.min(rect.width - 150, Math.max(8, point.x - 65));
      const top = Math.max(8, point.y - 68);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      draw();
    }

    canvas.addEventListener('pointermove', showTooltip);
    canvas.addEventListener('pointerleave', hideTooltip);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    resizeObserver?.observe(container);

    return {
      setData(nextSeries, nextRange) {
        series = Array.isArray(nextSeries) ? nextSeries : [];
        range = nextRange || '24h';
        activeIndex = -1;
        canvas.setAttribute('aria-label', `Transaction count over ${range}; ${series.reduce((sum, point) => sum + Number(point.count || 0), 0).toLocaleString()} transactions`);
        draw();
      },
      destroy() {
        resizeObserver?.disconnect();
      }
    };
  }

  return { buildChartGeometry, nearestPointIndex, createChart };
});
