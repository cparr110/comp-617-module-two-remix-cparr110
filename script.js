const palette = {
  overall: '#c3423f',
  core: '#1d6fa5',
  services: '#256b3f',
  positive: '#cf4d45',
  negative: '#2f6aa0',
  accent: '#f2a65a',
  ink: '#1f2a37'
};

const SERVICES_LABEL = 'Services less energy services';

const state = {
  selectedDate: null,
  sortMode: 'value',
  activeStepId: null
};

const dateParser = d3.utcParse('%Y-%m-%d');

let trend = [];
let categories = [];
let trendByDate = new Map();
let categoriesByDate = new Map();

function formatPct(value) {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${value.toFixed(1)}%`;
}

function formatUsd(value) {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `$${value.toFixed(2)}`;
}

function pearsonCorrelation(items, accessorX, accessorY) {
  const values = items
    .map((d) => [accessorX(d), accessorY(d)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (values.length < 3) {
    return null;
  }

  const meanX = d3.mean(values, (d) => d[0]);
  const meanY = d3.mean(values, (d) => d[1]);

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;

  for (const [x, y] of values) {
    const dx = x - meanX;
    const dy = y - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denominator = Math.sqrt(sumSqX * sumSqY);
  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function standardDeviation(values) {
  const clean = values.filter((d) => Number.isFinite(d));
  if (!clean.length) {
    return null;
  }

  const mean = d3.mean(clean);
  const variance = d3.mean(clean, (d) => (d - mean) ** 2);
  return Math.sqrt(variance);
}

function syncSortButtons() {
  d3.selectAll('.toggle').classed('is-active', false);
  d3.select(`.toggle[data-sort="${state.sortMode}"]`).classed('is-active', true);
}

function setSortMode(nextSort) {
  if (!nextSort || (nextSort !== 'value' && nextSort !== 'alpha')) {
    return;
  }

  state.sortMode = nextSort;
  syncSortButtons();
}

function setSelectedDate(nextDate) {
  if (!nextDate || !trendByDate.has(nextDate)) {
    return;
  }

  state.selectedDate = nextDate;
}

function setupControls() {
  d3.selectAll('.toggle').on('click', function onClick() {
    const nextSort = this.getAttribute('data-sort');
    if (!nextSort || nextSort === state.sortMode) {
      return;
    }

    setSortMode(nextSort);
    renderCategoryChart();
  });
}

function highlightFocus(focus) {
  d3.selectAll('.focus-target').classed('is-scrolly-focus', false);

  if (!focus) {
    return;
  }

  const map = {
    trend: '#trend-card',
    category: '#category-card',
    oil: '#oil-card',
    counter: '#counter-card'
  };

  const selector = map[focus];
  if (selector) {
    d3.select(selector).classed('is-scrolly-focus', true);
  }
}

function activateStep(stepElement) {
  const nextStepId = stepElement?.dataset?.stepId;
  if (!stepElement || (nextStepId && nextStepId === state.activeStepId)) {
    return;
  }

  d3.selectAll('.step').classed('is-active', false);
  d3.select(stepElement).classed('is-active', true);

  state.activeStepId = nextStepId ?? null;

  const title = stepElement.querySelector('h3')?.textContent ?? 'Scrollytelling Step';
  const body = stepElement.querySelector('p')?.textContent ?? '';
  d3.select('#step-title').text(title);
  d3.select('#step-body').text(body);

  setSelectedDate(stepElement.dataset.date);
  if (stepElement.dataset.sort) {
    setSortMode(stepElement.dataset.sort);
  }

  highlightFocus(stepElement.dataset.focus);
  renderAll();
}

function setupScrollytelling() {
  const stepNodes = d3.selectAll('.step').nodes();

  stepNodes.forEach((node) => {
    node.addEventListener('click', () => activateStep(node));
  });

  if (!stepNodes.length) {
    return;
  }

  const updateFromViewport = () => {
    const viewportCenter = window.innerHeight / 2;
    const visible = stepNodes
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight)
      .sort((a, b) => {
        const aCenter = a.rect.top + a.rect.height / 2;
        const bCenter = b.rect.top + b.rect.height / 2;
        return Math.abs(aCenter - viewportCenter) - Math.abs(bCenter - viewportCenter);
      });

    if (visible[0]) {
      activateStep(visible[0].node);
    }
  };

  const scheduleViewportUpdate = debounce(updateFromViewport, 30);
  window.addEventListener('scroll', scheduleViewportUpdate, { passive: true });
  window.addEventListener('resize', scheduleViewportUpdate);
  updateFromViewport();
}

function updateStats() {
  const selected = trendByDate.get(state.selectedDate);
  if (!selected) {
    return;
  }

  d3.select('#selected-month').text(selected.label);
  d3.select('#selected-overall').text(formatPct(selected.overallYoY));
  d3.select('#selected-core').text(formatPct(selected.coreYoY));
  d3.select('#selected-wti').text(formatUsd(selected.wti));

  d3.select('#claim-original-metric').text(`Energy CPI: ${formatPct(selected.energyYoY)}`);
  d3.select('#claim-counter-metric').text(`Services ex-energy: ${formatPct(selected.servicesYoY)}`);
}

function renderTrendChart() {
  const container = d3.select('#trend-chart');
  container.selectAll('*').remove();

  const width = container.node().clientWidth;
  const height = 400;
  const margin = { top: 28, right: 22, bottom: 42, left: 52 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleUtc()
    .domain(d3.extent(trend, (d) => d.dateObj))
    .range([0, innerWidth]);

  const inflationValues = trend
    .flatMap((d) => [d.overallYoY, d.coreYoY])
    .filter((d) => Number.isFinite(d));

  const y = d3
    .scaleLinear()
    .domain([
      Math.floor((d3.min(inflationValues) - 0.8) * 2) / 2,
      Math.ceil((d3.max(inflationValues) + 0.8) * 2) / 2
    ])
    .range([innerHeight, 0])
    .nice();

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(d3.utcYear.every(1)).tickFormat(d3.utcFormat('%Y')))
    .call((axis) => axis.select('.domain').remove());

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v}%`))
    .call((axis) => axis.select('.domain').remove());

  const line = (key) =>
    d3
      .line()
      .defined((d) => Number.isFinite(d[key]))
      .x((d) => x(d.dateObj))
      .y((d) => y(d[key]));

  g.append('path')
    .datum(trend)
    .attr('fill', 'none')
    .attr('stroke', palette.overall)
    .attr('stroke-width', 2.4)
    .attr('d', line('overallYoY'));

  g.append('path')
    .datum(trend)
    .attr('fill', 'none')
    .attr('stroke', palette.core)
    .attr('stroke-width', 2.4)
    .attr('d', line('coreYoY'));

  const legend = g.append('g').attr('class', 'legend').attr('transform', 'translate(0,-12)');

  const legendItems = [
    { label: 'Headline CPI', color: palette.overall },
    { label: 'Core CPI', color: palette.core }
  ];

  legendItems.forEach((item, index) => {
    const itemGroup = legend.append('g').attr('transform', `translate(${index * 150},0)`);
    itemGroup
      .append('line')
      .attr('x1', 0)
      .attr('x2', 18)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', item.color)
      .attr('stroke-width', 2.8);
    itemGroup.append('text').attr('x', 24).attr('y', 4).text(item.label);
  });

  const selected = trendByDate.get(state.selectedDate);
  if (selected) {
    const selectedX = x(selected.dateObj);

    g.append('line')
      .attr('x1', selectedX)
      .attr('x2', selectedX)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#5f6d7b')
      .attr('stroke-width', 1.3)
      .attr('stroke-dasharray', '4,4');

    if (Number.isFinite(selected.overallYoY)) {
      g.append('circle')
        .attr('cx', selectedX)
        .attr('cy', y(selected.overallYoY))
        .attr('r', 4.5)
        .attr('fill', palette.overall)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.3);
    }

    if (Number.isFinite(selected.coreYoY)) {
      g.append('circle')
        .attr('cx', selectedX)
        .attr('cy', y(selected.coreYoY))
        .attr('r', 4.5)
        .attr('fill', palette.core)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.3);
    }
  }

  const missingMonth = trend.find((d) => d.date === '2025-10-01');
  if (missingMonth) {
    const missingX = x(missingMonth.dateObj);
    g.append('line')
      .attr('x1', missingX)
      .attr('x2', missingX)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#6e7f91')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,6')
      .attr('opacity', 0.75);

    g.append('text')
      .attr('x', Math.min(missingX + 8, innerWidth - 130))
      .attr('y', 12)
      .attr('fill', '#495d71')
      .attr('font-size', 11)
      .text('Oct 2025 unavailable');
  }

  const tooltip = container.append('div').attr('class', 'tooltip').style('opacity', 0);
  const focus = g.append('g').style('display', 'none');

  focus
    .append('line')
    .attr('class', 'focus-line')
    .attr('y1', 0)
    .attr('y2', innerHeight)
    .attr('stroke', '#364655')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3');

  const focusOverall = focus
    .append('circle')
    .attr('r', 4)
    .attr('fill', palette.overall)
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.2);

  const focusCore = focus
    .append('circle')
    .attr('r', 4)
    .attr('fill', palette.core)
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.2);

  const bisectDate = d3.bisector((d) => d.dateObj).center;
  const hoverable = trend.filter(
    (d) => Number.isFinite(d.overallYoY) || Number.isFinite(d.coreYoY)
  );

  g.append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .on('pointerenter', () => {
      focus.style('display', null);
      tooltip.style('opacity', 1);
    })
    .on('pointerleave', () => {
      focus.style('display', 'none');
      tooltip.style('opacity', 0);
    })
    .on('pointermove', function onMove(event) {
      const [mx] = d3.pointer(event, this);
      const closest = hoverable[bisectDate(hoverable, x.invert(mx))];
      if (!closest) {
        return;
      }

      const cx = x(closest.dateObj);
      focus.select('.focus-line').attr('x1', cx).attr('x2', cx);

      if (Number.isFinite(closest.overallYoY)) {
        focusOverall.attr('cx', cx).attr('cy', y(closest.overallYoY)).style('display', null);
      } else {
        focusOverall.style('display', 'none');
      }

      if (Number.isFinite(closest.coreYoY)) {
        focusCore.attr('cx', cx).attr('cy', y(closest.coreYoY)).style('display', null);
      } else {
        focusCore.style('display', 'none');
      }

      tooltip
        .html(
          `<strong>${closest.label}</strong><br>Headline: ${formatPct(closest.overallYoY)}<br>Core: ${formatPct(
            closest.coreYoY
          )}`
        )
        .style('left', `${margin.left + cx}px`)
        .style('top', `${margin.top + Math.max(16, y(closest.overallYoY ?? closest.coreYoY))}px`);
    })
    .on('click', function onClick(event) {
      const [mx] = d3.pointer(event, this);
      const closest = hoverable[bisectDate(hoverable, x.invert(mx))];
      if (!closest || closest.date === state.selectedDate) {
        return;
      }

      setSelectedDate(closest.date);
      renderAll();
    });
}

function renderCategoryChart() {
  const container = d3.select('#category-chart');
  container.selectAll('*').remove();

  const monthData = [...(categoriesByDate.get(state.selectedDate) ?? [])];
  const selectedTrend = trendByDate.get(state.selectedDate);

  d3.select('#category-title').text(
    `Category inflation in ${selectedTrend ? selectedTrend.label : 'selected month'}`
  );

  if (!monthData.length) {
    container.append('p').text('No category data for this month.');
    return;
  }

  if (state.sortMode === 'value') {
    monthData.sort((a, b) => d3.descending(a.yoy, b.yoy));
  } else {
    monthData.sort((a, b) => a.category.localeCompare(b.category));
  }

  const width = container.node().clientWidth;
  const barHeight = 28;
  const height = Math.max(320, monthData.length * barHeight + 80);
  const margin = { top: 34, right: 80, bottom: 26, left: 232 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const maxAbs = d3.max([
    d3.max(monthData, (d) => Math.abs(d.yoy)),
    Math.abs(selectedTrend?.overallYoY ?? 0),
    3
  ]);

  const x = d3.scaleLinear().domain([-maxAbs * 1.1, maxAbs * 1.1]).range([0, innerWidth]);
  const y = d3
    .scaleBand()
    .domain(monthData.map((d) => d.category))
    .range([0, innerHeight])
    .padding(0.18);

  g.append('g')
    .attr('class', 'grid')
    .attr('transform', 'translate(0,0)')
    .call(d3.axisTop(x).tickSize(-innerHeight).tickFormat(''));

  g.append('line')
    .attr('x1', x(0))
    .attr('x2', x(0))
    .attr('y1', 0)
    .attr('y2', innerHeight)
    .attr('stroke', '#304659')
    .attr('stroke-width', 1.2)
    .attr('opacity', 0.7);

  const tooltip = container.append('div').attr('class', 'tooltip').style('opacity', 0);

  g.selectAll('rect')
    .data(monthData)
    .join('rect')
    .attr('x', (d) => x(Math.min(0, d.yoy)))
    .attr('y', (d) => y(d.category))
    .attr('width', (d) => Math.abs(x(d.yoy) - x(0)))
    .attr('height', y.bandwidth())
    .attr('rx', 4)
    .attr('fill', (d) => (d.yoy >= 0 ? palette.positive : palette.negative))
    .on('pointermove', (event, d) => {
      const [mx, my] = d3.pointer(event, container.node());
      tooltip
        .style('opacity', 1)
        .style('left', `${mx}px`)
        .style('top', `${my}px`)
        .html(`<strong>${d.category}</strong><br>${formatPct(d.yoy)} YoY`);
    })
    .on('pointerleave', () => tooltip.style('opacity', 0));

  g.selectAll('.value-label')
    .data(monthData)
    .join('text')
    .attr('class', 'value-label')
    .attr('x', (d) => (d.yoy >= 0 ? x(d.yoy) + 6 : x(d.yoy) - 6))
    .attr('y', (d) => y(d.category) + y.bandwidth() / 2 + 4)
    .attr('text-anchor', (d) => (d.yoy >= 0 ? 'start' : 'end'))
    .attr('fill', '#22384f')
    .attr('font-size', 11)
    .text((d) => `${d.yoy.toFixed(1)}%`);

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y))
    .call((axis) => axis.select('.domain').remove())
    .selectAll('text')
    .style('font-size', '11px');

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisTop(x).ticks(6).tickFormat((d) => `${d}%`))
    .call((axis) => axis.select('.domain').remove());

  if (Number.isFinite(selectedTrend?.overallYoY)) {
    g.append('line')
      .attr('x1', x(selectedTrend.overallYoY))
      .attr('x2', x(selectedTrend.overallYoY))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', palette.accent)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,4');

    g.append('text')
      .attr('x', Math.min(innerWidth - 130, x(selectedTrend.overallYoY) + 6))
      .attr('y', -10)
      .attr('fill', '#8f5e27')
      .attr('font-size', 11)
      .text(`Overall CPI: ${selectedTrend.overallYoY.toFixed(1)}%`);
  }
}

function renderOilChart() {
  const container = d3.select('#oil-chart');
  container.selectAll('*').remove();

  const points = trend.filter((d) => Number.isFinite(d.wti) && Number.isFinite(d.energyYoY));

  const width = container.node().clientWidth;
  const height = 380;
  const margin = { top: 24, right: 20, bottom: 48, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d.wti))
    .nice()
    .range([0, innerWidth]);

  const y = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d.energyYoY))
    .nice()
    .range([innerHeight, 0]);

  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickSize(-innerHeight).tickFormat(''));

  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(7).tickFormat((d) => `$${d}`))
    .call((axis) => axis.select('.domain').remove());

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat((d) => `${d}%`))
    .call((axis) => axis.select('.domain').remove());

  g.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 40)
    .attr('text-anchor', 'middle')
    .attr('fill', '#33475b')
    .attr('font-size', 12)
    .text('WTI crude oil price ($/barrel)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -42)
    .attr('text-anchor', 'middle')
    .attr('fill', '#33475b')
    .attr('font-size', 12)
    .text('Energy CPI inflation (YoY)');

  g.append('path')
    .datum(points)
    .attr('fill', 'none')
    .attr('stroke', '#6f8da8')
    .attr('stroke-width', 1.4)
    .attr('opacity', 0.55)
    .attr('d', d3.line().x((d) => x(d.wti)).y((d) => y(d.energyYoY)));

  const color = d3
    .scaleSequential()
    .domain(d3.extent(points, (d) => d.dateObj.getTime()))
    .interpolator(d3.interpolateYlOrRd);

  const tooltip = container.append('div').attr('class', 'tooltip').style('opacity', 0);

  g.selectAll('circle.point')
    .data(points)
    .join('circle')
    .attr('class', 'point')
    .attr('cx', (d) => x(d.wti))
    .attr('cy', (d) => y(d.energyYoY))
    .attr('r', (d) => (d.date === state.selectedDate ? 6.5 : 4))
    .attr('fill', (d) => color(d.dateObj.getTime()))
    .attr('stroke', (d) => (d.date === state.selectedDate ? palette.ink : '#ffffff'))
    .attr('stroke-width', (d) => (d.date === state.selectedDate ? 1.8 : 0.8))
    .style('cursor', 'pointer')
    .on('pointermove', (event, d) => {
      const [mx, my] = d3.pointer(event, container.node());
      tooltip
        .style('opacity', 1)
        .style('left', `${mx}px`)
        .style('top', `${my}px`)
        .html(`<strong>${d.label}</strong><br>WTI: ${formatUsd(d.wti)}<br>Energy CPI: ${formatPct(d.energyYoY)}`);
    })
    .on('pointerleave', () => tooltip.style('opacity', 0))
    .on('click', (_, d) => {
      setSelectedDate(d.date);
      renderAll();
    });

  const selected = trendByDate.get(state.selectedDate);
  if (selected && Number.isFinite(selected.wti) && Number.isFinite(selected.energyYoY)) {
    g.append('line')
      .attr('x1', x(selected.wti))
      .attr('x2', x(selected.wti))
      .attr('y1', y(selected.energyYoY))
      .attr('y2', innerHeight)
      .attr('stroke', '#5d7083')
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.8);

    g.append('line')
      .attr('x1', 0)
      .attr('x2', x(selected.wti))
      .attr('y1', y(selected.energyYoY))
      .attr('y2', y(selected.energyYoY))
      .attr('stroke', '#5d7083')
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.8);
  }

  const corr = pearsonCorrelation(points, (d) => d.wti, (d) => d.energyYoY);
  const insight = selected
    ? `${selected.label}: WTI ${formatUsd(selected.wti)} and energy CPI ${formatPct(
        selected.energyYoY
      )}. 2019-2026 monthly correlation between oil and energy CPI is ${corr?.toFixed(2) ?? 'n/a'}.`
    : `2019-2026 monthly correlation between oil and energy CPI is ${corr?.toFixed(2) ?? 'n/a'}.`;

  d3.select('#oil-insight').text(insight);
}

function renderCounterChart() {
  const container = d3.select('#counter-chart');
  container.selectAll('*').remove();

  const points = trend.filter(
    (d) => Number.isFinite(d.energyYoY) && Number.isFinite(d.servicesYoY) && d.date >= '2021-01-01'
  );

  if (!points.length) {
    container.append('p').text('No comparison data available.');
    return;
  }

  const width = container.node().clientWidth;
  const height = 360;
  const margin = { top: 26, right: 20, bottom: 44, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleUtc()
    .domain(d3.extent(points, (d) => d.dateObj))
    .range([0, innerWidth]);

  const y = d3
    .scaleLinear()
    .domain(d3.extent(points.flatMap((d) => [d.energyYoY, d.servicesYoY])))
    .nice()
    .range([innerHeight, 0]);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(d3.utcYear.every(1)).tickFormat(d3.utcFormat('%Y')))
    .call((axis) => axis.select('.domain').remove());

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v}%`))
    .call((axis) => axis.select('.domain').remove());

  const line = (key) =>
    d3
      .line()
      .defined((d) => Number.isFinite(d[key]))
      .x((d) => x(d.dateObj))
      .y((d) => y(d[key]));

  g.append('path')
    .datum(points)
    .attr('fill', 'none')
    .attr('stroke', palette.positive)
    .attr('stroke-width', 2.1)
    .attr('d', line('energyYoY'));

  g.append('path')
    .datum(points)
    .attr('fill', 'none')
    .attr('stroke', palette.services)
    .attr('stroke-width', 2.1)
    .attr('d', line('servicesYoY'));

  const legend = g.append('g').attr('class', 'legend').attr('transform', 'translate(0,-12)');
  [
    { label: 'Energy CPI', color: palette.positive },
    { label: 'Services less energy services', color: palette.services }
  ].forEach((item, index) => {
    const itemGroup = legend.append('g').attr('transform', `translate(${index * 210},0)`);
    itemGroup
      .append('line')
      .attr('x1', 0)
      .attr('x2', 18)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', item.color)
      .attr('stroke-width', 2.8);
    itemGroup.append('text').attr('x', 24).attr('y', 4).text(item.label);
  });

  const selected = trendByDate.get(state.selectedDate);
  if (selected && Number.isFinite(selected.energyYoY) && Number.isFinite(selected.servicesYoY)) {
    const selectedX = x(selected.dateObj);

    g.append('line')
      .attr('x1', selectedX)
      .attr('x2', selectedX)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#5f6d7b')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '4,4');

    g.append('circle')
      .attr('cx', selectedX)
      .attr('cy', y(selected.energyYoY))
      .attr('r', 4.3)
      .attr('fill', palette.positive)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.2);

    g.append('circle')
      .attr('cx', selectedX)
      .attr('cy', y(selected.servicesYoY))
      .attr('r', 4.3)
      .attr('fill', palette.services)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.2);
  }

  const tooltip = container.append('div').attr('class', 'tooltip').style('opacity', 0);
  const bisectDate = d3.bisector((d) => d.dateObj).center;

  g.append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .on('pointermove', function onMove(event) {
      const [mx] = d3.pointer(event, this);
      const closest = points[bisectDate(points, x.invert(mx))];
      if (!closest) {
        return;
      }

      tooltip
        .style('opacity', 1)
        .style('left', `${margin.left + x(closest.dateObj)}px`)
        .style('top', `${margin.top + y(closest.servicesYoY)}px`)
        .html(
          `<strong>${closest.label}</strong><br>Energy CPI: ${formatPct(closest.energyYoY)}<br>Services ex-energy: ${formatPct(
            closest.servicesYoY
          )}`
        );
    })
    .on('pointerleave', () => tooltip.style('opacity', 0))
    .on('click', function onClick(event) {
      const [mx] = d3.pointer(event, this);
      const closest = points[bisectDate(points, x.invert(mx))];
      if (!closest) {
        return;
      }

      setSelectedDate(closest.date);
      renderAll();
    });

  const energyVolatility = standardDeviation(points.map((d) => d.energyYoY));
  const servicesVolatility = standardDeviation(points.map((d) => d.servicesYoY));

  const summary = selected
    ? `${selected.label}: energy CPI ${formatPct(selected.energyYoY)} vs services ex-energy ${formatPct(
        selected.servicesYoY
      )}. Since 2021, energy has been about ${(energyVolatility ?? 0).toFixed(1)} pp volatile monthly, versus ${(servicesVolatility ?? 0).toFixed(1)} pp for services.`
    : `Since 2021, energy has been about ${(energyVolatility ?? 0).toFixed(1)} pp volatile monthly, versus ${(servicesVolatility ?? 0).toFixed(1)} pp for services.`;

  d3.select('#counter-insight').text(summary);
}

function renderAll() {
  updateStats();
  renderTrendChart();
  renderCategoryChart();
  renderOilChart();
  renderCounterChart();
}

function debounce(fn, waitMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}

async function init() {
  const raw = await d3.json('data/inflation-data.json');

  const servicesByDate = new Map(
    raw.categories
      .filter((d) => d.category === SERVICES_LABEL)
      .map((d) => [d.date, d.yoy])
  );

  trend = raw.trend.map((d) => ({
    ...d,
    dateObj: dateParser(d.date),
    servicesYoY: servicesByDate.get(d.date) ?? null
  }));

  categories = raw.categories;
  trendByDate = new Map(trend.map((d) => [d.date, d]));
  categoriesByDate = d3.group(categories, (d) => d.date);

  setSelectedDate(raw.metadata?.selectedDateDefault ?? trend.findLast((d) => Number.isFinite(d.overallYoY))?.date);

  setupControls();
  setupScrollytelling();
  syncSortButtons();

  const firstStep = d3.select('.step').node();
  if (firstStep) {
    activateStep(firstStep);
  } else {
    renderAll();
  }

  window.addEventListener(
    'resize',
    debounce(() => {
      renderAll();
    }, 180)
  );
}

init().catch((error) => {
  console.error('Failed to load visualization data.', error);
});
