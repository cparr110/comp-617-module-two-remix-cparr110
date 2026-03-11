import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '..', 'data');

const SERIES = [
  { id: 'CPIAUCSL', label: 'Overall CPI', group: 'headline' },
  { id: 'CPILFESL', label: 'Core CPI (less food and energy)', group: 'headline' },
  { id: 'CPIENGSL', label: 'Energy', group: 'headline' },
  { id: 'CPIFABSL', label: 'Food and beverages', group: 'headline' },
  { id: 'CUSR0000SAH1', label: 'Shelter', group: 'headline' },
  { id: 'MCOILWTICO', label: 'WTI crude oil ($/barrel)', group: 'external' },
  { id: 'CUSR0000SEHF01', label: 'Electricity', group: 'category' },
  { id: 'CUSR0000SEHF02', label: 'Utility gas service', group: 'category' },
  { id: 'CUSR0000SETA02', label: 'Used cars and trucks', group: 'category' },
  { id: 'CUSR0000SETA01', label: 'New vehicles', group: 'category' },
  { id: 'CPIAPPNS', label: 'Apparel', group: 'category' },
  { id: 'CUSR0000SEFV', label: 'Food away from home', group: 'category' },
  { id: 'CUSR0000SASLE', label: 'Services less energy services', group: 'category' },
  { id: 'CUSR0000SAF113', label: 'Fruits and vegetables', group: 'category' },
  { id: 'CUSR0000SAF112', label: 'Meats, poultry, fish, and eggs', group: 'category' },
  { id: 'CUSR0000SEMD', label: 'Hospital and related services', group: 'category' }
];

const SERIES_LOOKUP = Object.fromEntries(SERIES.map((s) => [s.id, s]));

function parseCsv(csvText) {
  const rows = csvText.trim().split('\n');
  const records = [];

  for (let i = 1; i < rows.length; i += 1) {
    const [date, raw] = rows[i].split(',');
    const value = raw === '' || raw === '.' || raw == null ? null : Number(raw);
    records.push({ date, value: Number.isFinite(value) ? value : null });
  }

  return records;
}

function computeYoY(records) {
  const out = [];

  for (let i = 0; i < records.length; i += 1) {
    const current = records[i];
    const prior = records[i - 12];

    if (!prior || current.value == null || prior.value == null || prior.value === 0) {
      out.push({ date: current.date, yoy: null });
      continue;
    }

    const yoy = ((current.value / prior.value) - 1) * 100;
    out.push({ date: current.date, yoy: Number(yoy.toFixed(3)) });
  }

  return out;
}

function buildDateMap(records, fieldName) {
  const map = new Map();

  for (const row of records) {
    map.set(row.date, { [fieldName]: row.value });
  }

  return map;
}

function mergeIntoDateMap(baseMap, incomingRows, fieldName) {
  for (const row of incomingRows) {
    const existing = baseMap.get(row.date) ?? {};
    existing[fieldName] = row.yoy;
    baseMap.set(row.date, existing);
  }
}

async function fetchSeries(id) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${id}: ${response.status}`);
  }

  const text = await response.text();

  if (!text.startsWith('observation_date')) {
    throw new Error(`Unexpected response for ${id}`);
  }

  return parseCsv(text);
}

function dateToLabel(dateString) {
  return new Date(`${dateString}T00:00:00Z`).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const seriesData = new Map();
  await Promise.all(
    SERIES.map(async (series) => {
      const records = await fetchSeries(series.id);
      seriesData.set(series.id, records);
    })
  );

  const overallRaw = seriesData.get('CPIAUCSL');
  const overallYoY = computeYoY(overallRaw);

  const merged = buildDateMap(overallRaw, 'overallIndex');
  mergeIntoDateMap(merged, overallYoY, 'overallYoY');

  for (const id of ['CPILFESL', 'CPIENGSL', 'CPIFABSL', 'CUSR0000SAH1']) {
    const yoyRows = computeYoY(seriesData.get(id));
    const key = id === 'CPILFESL'
      ? 'coreYoY'
      : id === 'CPIENGSL'
        ? 'energyYoY'
        : id === 'CPIFABSL'
          ? 'foodYoY'
          : 'shelterYoY';
    mergeIntoDateMap(merged, yoyRows, key);
  }

  const oilRows = seriesData.get('MCOILWTICO');
  for (const row of oilRows) {
    const existing = merged.get(row.date) ?? {};
    existing.wti = row.value;
    merged.set(row.date, existing);
  }

  const trendRecords = [...merged.entries()]
    .map(([date, values]) => ({
      date,
      label: dateToLabel(date),
      overallYoY: values.overallYoY ?? null,
      coreYoY: values.coreYoY ?? null,
      energyYoY: values.energyYoY ?? null,
      foodYoY: values.foodYoY ?? null,
      shelterYoY: values.shelterYoY ?? null,
      wti: values.wti ?? null
    }))
    .filter((d) => d.date >= '2019-01-01')
    .sort((a, b) => a.date.localeCompare(b.date));

  const categorySeries = SERIES.filter((s) => s.group === 'category');
  const categoryRecords = [];

  for (const series of categorySeries) {
    const yoyRows = computeYoY(seriesData.get(series.id));
    for (const row of yoyRows) {
      if (row.date < '2021-01-01' || row.yoy == null) {
        continue;
      }

      categoryRecords.push({
        date: row.date,
        label: dateToLabel(row.date),
        seriesId: series.id,
        category: series.label,
        yoy: row.yoy
      });
    }
  }

  categoryRecords.sort((a, b) => {
    if (a.date === b.date) {
      return a.category.localeCompare(b.category);
    }
    return a.date.localeCompare(b.date);
  });

  const latestComparable = [...trendRecords]
    .reverse()
    .find((d) => d.overallYoY != null && d.coreYoY != null && d.wti != null);

  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'FRED (St. Louis Fed), underlying series from U.S. Bureau of Labor Statistics and U.S. Energy Information Administration',
      series: SERIES,
      selectedDateDefault: latestComparable?.date ?? null
    },
    trend: trendRecords,
    categories: categoryRecords
  };

  await writeFile(path.join(outputDir, 'inflation-data.json'), JSON.stringify(output, null, 2));

  console.log(`Wrote ${path.join(outputDir, 'inflation-data.json')}`);
  console.log(`Trend records: ${trendRecords.length}`);
  console.log(`Category records: ${categoryRecords.length}`);
  console.log(`Default selected month: ${output.metadata.selectedDateDefault}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
