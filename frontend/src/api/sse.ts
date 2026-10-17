import type { AgentEvent } from './contract';
import { getApiBase, isMockMode } from './client';

const MOCK_SCRIPT: Omit<AgentEvent, 'runId' | 'at'>[] = [
  {
    agent: 'Satellite Scout',
    step: 'ingest_modis',
    status: 'RUNNING',
    message: 'Fetching NASA GIBS MODIS 250 m 8-day NDVI composite across 25 districts in 5 states…',
  },
  {
    agent: 'Satellite Scout',
    step: 'compute_anomaly',
    status: 'RUNNING',
    message: 'Computing pixel-masked cropland NDVI anomalies against 5-year seasonal baseline…',
  },
  {
    agent: 'Satellite Scout',
    step: 'complete',
    status: 'COMPLETE',
    message: 'Flagged Yavatmal (−27.9%), Sri Ganganagar (−22.1%), Akola (−20.6%), and Bathinda (−19.1%).',
  },
  {
    agent: 'Weather Watch',
    step: 'ingest_meteo',
    status: 'RUNNING',
    message: 'Querying Open-Meteo & NASA POWER for 7-day rainfall, vapour pressure deficit, and 5-day forecast…',
  },
  {
    agent: 'Weather Watch',
    step: 'detect_alerts',
    status: 'RUNNING',
    message: 'Evaluating synoptic heatwave, dry spell, high wind, and heavy rain thresholds…',
  },
  {
    agent: 'Weather Watch',
    step: 'complete',
    status: 'COMPLETE',
    message: '5 active weather alerts confirmed (Severe Heatwave 45.2 °C in Sri Ganganagar; Heatwave 41.8 °C in Yavatmal).',
  },
  {
    agent: 'Crop Risk Analyst',
    step: 'fuse_signals',
    status: 'RUNNING',
    message: 'Fusing MODIS canopy drop, moisture deficit, and crop phenology stage into composite risk scores…',
  },
  {
    agent: 'Crop Risk Analyst',
    step: 'rank_districts',
    status: 'RUNNING',
    message: 'Ranking 25 monitored districts by risk score and checking escalation rules…',
  },
  {
    agent: 'Crop Risk Analyst',
    step: 'complete',
    status: 'COMPLETE',
    message: 'Leaderboard updated: #1 Yavatmal (87 CRITICAL, P1), #2 Sri Ganganagar (76 HIGH, P2), #3 Akola (72 HIGH, P2).',
  },
  {
    agent: 'Field Monitor',
    step: 'check_parcels',
    status: 'RUNNING',
    message: 'Scanning 12 registered farmer parcels with 10 m Sentinel-2 L2A & linked Soil Health Cards…',
  },
  {
    agent: 'Field Monitor',
    step: 'evaluate_followups',
    status: 'RUNNING',
    message: 'Evaluating 21-day post-advisory ΔNDVI trajectories and cloud-cover usability…',
  },
  {
    agent: 'Field Monitor',
    step: 'complete',
    status: 'COMPLETE',
    message: 'Follow-up queue updated: 1 deteriorating (P1 field support), 1 recovering (needs verification), 1 cloudy.',
  },
];

export function subscribeRun(
  runId: string,
  onEvent: (event: AgentEvent) => void,
  onEnd: () => void,
): () => void {
  if (isMockMode()) {
    let idx = 0;
    const timer = window.setInterval(() => {
      if (idx < MOCK_SCRIPT.length) {
        const item = MOCK_SCRIPT[idx];
        onEvent({
          ...item,
          runId,
          at: new Date().toISOString(),
        });
        idx += 1;
      } else {
        window.clearInterval(timer);
        onEnd();
      }
    }, 400);

    return () => {
      window.clearInterval(timer);
    };
  }

  const es = new EventSource(`${getApiBase()}/api/stream/${encodeURIComponent(runId)}`);
  es.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(ev.data) as AgentEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed event
    }
  };
  es.addEventListener('end', () => {
    es.close();
    onEnd();
  });
  es.onerror = () => {
    es.close();
    onEnd();
  };

  return () => {
    es.close();
  };
}
