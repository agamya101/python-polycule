import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { DistrictSummary, Farmer, WeatherAlert } from '@/api/contract';
import { DataBadge } from '@/components/ui/DataBadge';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { useTheme } from '@/theme/useTheme';
import { useThemeColors } from '@/theme/useThemeColors';
import { cn } from '@/lib/cn';

export interface DistrictMapHandle {
  flyToDistrict: (districtId: string) => void;
}

export interface DistrictMapProps {
  districts: DistrictSummary[];
  alerts?: WeatherAlert[];
  farmers?: Farmer[];
  selectedDistrictId?: string | null;
  onSelectDistrict?: (district: DistrictSummary) => void;
  mini?: boolean;
  heightClassName?: string;
}

function MapController({
  districts,
  flyTarget,
  onZoomChange,
}: {
  districts: DistrictSummary[];
  flyTarget: string | null;
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMap();

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    if (!flyTarget) return;
    const found = districts.find((d) => d.id === flyTarget);
    if (found) {
      map.flyTo([found.lat, found.lon], 8, { duration: 0.9 });
    }
  }, [flyTarget, districts, map]);

  return null;
}

function makeAlertDivIcon(
  type: WeatherAlert['type'],
  ringColor: string,
  surfaceColor: string,
  inkColor: string,
) {
  const glyphMap: Record<WeatherAlert['type'], string> = {
    HEAVY_RAIN: '🌧',
    HEATWAVE: '🌡',
    COLD_WAVE: '❄',
    HIGH_WIND: '💨',
    DRY_SPELL: '☀',
  };
  const glyph = glyphMap[type] ?? '⚠';
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:999px;background:${surfaceColor};color:${inkColor};border:2.5px solid ${ringColor};display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35);">${glyph}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export const DistrictMap = forwardRef<DistrictMapHandle, DistrictMapProps>(
  (
    {
      districts,
      alerts = [],
      farmers = [],
      selectedDistrictId,
      onSelectDistrict,
      mini = false,
      heightClassName = 'h-[60vh] min-h-[420px]',
    },
    ref,
  ) => {
    const { mode } = useTheme();
    const colors = useThemeColors();
    const [colorMode, setColorMode] = useState<'RISK' | 'NDVI'>('RISK');
    const [showModisRaster, setShowModisRaster] = useState(false);
    const [showAlerts, setShowAlerts] = useState(!mini);
    const [showFarmers, setShowFarmers] = useState(!mini);
    const [zoom, setZoom] = useState(5);
    const [flyTarget, setFlyTarget] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      flyToDistrict(districtId: string) {
        setFlyTarget(districtId);
      },
    }));

    const tileUrl =
      mode === 'dark'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';

    const modisGIBSUrl =
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2025-03-22/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png';

    const getNdviColor = (anomalyPct: number): string => {
      if (anomalyPct <= -20) return colors.ndvi[0];
      if (anomalyPct <= -10) return colors.ndvi[1];
      if (anomalyPct <= -3) return colors.ndvi[2];
      if (anomalyPct <= 3) return colors.ndvi[3];
      return colors.ndvi[4];
    };

    const getRiskColor = (level: DistrictSummary['riskLevel']): string => {
      return colors.risk[level];
    };

    return (
      <div
        className={cn(
          'relative rounded-card overflow-hidden border border-line bg-surface-2',
          mini ? 'h-[320px]' : heightClassName,
        )}
      >
        {/* Top-left layer toggle chips */}
        {!mini && (
          <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-1.5 bg-surface/90 backdrop-blur-sm p-1.5 rounded-ctl border border-line shadow-md">
            <button
              type="button"
              onClick={() => setColorMode('RISK')}
              className={cn(
                'px-2.5 py-1 rounded-ctl text-xs font-mono font-semibold cursor-pointer',
                colorMode === 'RISK'
                  ? 'bg-primary text-on-primary'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Risk Layer
            </button>
            <button
              type="button"
              onClick={() => setColorMode('NDVI')}
              className={cn(
                'px-2.5 py-1 rounded-ctl text-xs font-mono font-semibold cursor-pointer',
                colorMode === 'NDVI'
                  ? 'bg-primary text-on-primary'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              NDVI Anomaly
            </button>
            <button
              type="button"
              onClick={() => setShowModisRaster((v) => !v)}
              className={cn(
                'px-2.5 py-1 rounded-ctl text-xs font-mono font-semibold cursor-pointer border',
                showModisRaster
                  ? 'bg-success/20 text-success border-success/50'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
              title="Overlay live NASA GIBS MODIS Terra 8-Day 250 m NDVI satellite raster"
            >
              NASA GIBS MODIS Raster
            </button>
            <button
              type="button"
              onClick={() => setShowAlerts((v) => !v)}
              className={cn(
                'px-2.5 py-1 rounded-ctl text-xs font-mono font-semibold cursor-pointer border',
                showAlerts
                  ? 'bg-accent/25 text-ink border-accent/50'
                  : 'border-transparent text-ink-muted',
              )}
            >
              Weather Alerts ({alerts.length})
            </button>
            <button
              type="button"
              onClick={() => setShowFarmers((v) => !v)}
              className={cn(
                'px-2.5 py-1 rounded-ctl text-xs font-mono font-semibold cursor-pointer border',
                showFarmers
                  ? 'bg-info/20 text-info border-info/40'
                  : 'border-transparent text-ink-muted',
              )}
              title="Registered farmer dots appear at zoom ≥ 8"
            >
              Farmers (zoom ≥ 8)
            </button>
          </div>
        )}

        {/* Top-right ScaleBadge + DataBadge */}
        <div className="absolute top-3 right-3 z-[400] flex items-center gap-1.5">
          <ScaleBadge scale="DISTRICT_MODIS_250M" />
          <DataBadge
            status={showModisRaster ? 'LIVE' : 'SIMULATED'}
            source="NASA GIBS MODIS 250 m"
          />
        </div>

        {/* Bottom-right Legend */}
        <div className="absolute bottom-3 right-3 z-[400] bg-surface/90 backdrop-blur-sm p-2.5 rounded-ctl border border-line text-[11px] font-mono space-y-1.5 shadow-md">
          {colorMode === 'RISK' ? (
            <>
              <div className="font-bold text-ink">District Risk Score</div>
              <div className="flex items-center gap-2">
                {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((lvl) => (
                  <span key={lvl} className="inline-flex items-center gap-1 text-ink-muted">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ background: colors.risk[lvl] }}
                    />
                    {lvl}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="font-bold text-ink">MODIS NDVI Anomaly %</div>
              <div className="flex items-center gap-2 text-ink-muted">
                {[
                  { label: '≤-20%', c: colors.ndvi[0] },
                  { label: '-20..-10%', c: colors.ndvi[1] },
                  { label: '-10..-3%', c: colors.ndvi[2] },
                  { label: '-3..+3%', c: colors.ndvi[3] },
                  { label: '>+3%', c: colors.ndvi[4] },
                ].map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ background: item.c }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <MapContainer
          center={[23.5, 78.5]}
          zoom={5}
          scrollWheelZoom
          className="w-full h-full z-0"
        >
          <TileLayer
            key={mode}
            url={tileUrl}
            attribution="Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ"
          />
          {showModisRaster && (
            <TileLayer
              url={modisGIBSUrl}
              opacity={0.55}
              maxNativeZoom={9}
              attribution="Imagery &copy; NASA EOSDIS GIBS (MODIS Terra 250 m NDVI)"
            />
          )}
          <MapController
            districts={districts}
            flyTarget={flyTarget}
            onZoomChange={setZoom}
          />

          {/* District CircleMarkers */}
          {districts.map((d) => {
            const radius = 8 + d.acreageLakh * 3;
            const fillColor =
              colorMode === 'RISK' ? getRiskColor(d.riskLevel) : getNdviColor(d.ndviAnomalyPct);
            const isSelected = selectedDistrictId === d.id;

            return (
              <CircleMarker
                key={d.id}
                center={[d.lat, d.lon]}
                radius={radius}
                pathOptions={{
                  color: isSelected ? colors.ink : fillColor,
                  weight: isSelected ? 3 : 1.5,
                  fillColor,
                  fillOpacity: 0.75,
                }}
                eventHandlers={{
                  click: () => {
                    onSelectDistrict?.(d);
                    setFlyTarget(d.id);
                  },
                }}
              >
                <Popup>
                  <div className="space-y-1.5 text-xs min-w-[180px]">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">{d.district}</strong>
                      <RiskBadge level={d.riskLevel} score={d.riskScore} />
                    </div>
                    <div className="font-mono text-[11px]">
                      State: {d.state} · Crop: {d.primaryCrop}
                    </div>
                    <div className="font-mono text-[11px]">
                      NDVI: {d.ndvi.toFixed(2)} (Baseline {d.ndviBaseline.toFixed(2)},{' '}
                      {d.ndviAnomalyPct > 0 ? '+' : ''}
                      {d.ndviAnomalyPct.toFixed(1)}%)
                    </div>
                    <div className="font-mono text-[11px]">
                      Alerts: {d.weatherAlertCount} · Farmers: {d.registeredFarmers}
                    </div>
                    <div className="pt-1">
                      <Link
                        to={`/districts/${d.id}`}
                        className="font-bold underline text-primary"
                      >
                        Open district report →
                      </Link>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Weather Alert Markers */}
          {showAlerts &&
            alerts.map((a, idx) => {
              const dist = districts.find((d) => d.id === a.districtId);
              if (!dist) return null;
              const ringColor =
                a.severity === 'SEVERE'
                  ? colors.danger
                  : a.severity === 'WARNING'
                    ? colors.risk.HIGH
                    : colors.warning;
              const offsetLat = dist.lat + 0.25 + (idx % 2) * 0.15;
              const offsetLon = dist.lon + 0.25;
              return (
                <Marker
                  key={a.id}
                  position={[offsetLat, offsetLon]}
                  icon={makeAlertDivIcon(a.type, ringColor, colors.surface, colors.ink)}
                >
                  <Popup>
                    <div className="text-xs space-y-1">
                      <div className="font-bold">{a.title}</div>
                      <div>{a.message}</div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Farmer Dots visible only when zoom >= 8 */}
          {showFarmers &&
            zoom >= 8 &&
            farmers.map((f) => (
              <CircleMarker
                key={f.id}
                center={f.field.centroid}
                radius={5}
                pathOptions={{
                  color: colors.surface,
                  weight: 1.5,
                  fillColor: colors.accent,
                  fillOpacity: 0.95,
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">
                      {f.name} ({f.id})
                    </div>
                    <div className="font-mono text-[11px]">
                      {f.village} · {f.crop} · {f.field.areaHa} ha
                    </div>
                    <Link to={`/farmers/${f.id}`} className="font-bold underline text-primary">
                      Open farmer detail →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>
    );
  },
);
DistrictMap.displayName = 'DistrictMap';
