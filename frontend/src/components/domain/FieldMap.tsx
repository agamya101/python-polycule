import { useEffect, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type {
  BoundaryStatus,
  BoundaryVerifyBody,
  GeoPolygon,
  RiskLevel,
} from '@/api/contract';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { haToAcres } from '@/lib/format';
import { areaHa, centroid, pixelCount10m, sizeClass } from '@/lib/geo';
import { useThemeColors } from '@/theme/useThemeColors';
import { BoundaryEditor } from './BoundaryEditor';

export interface FieldMapProps {
  polygon: GeoPolygon | null;
  center?: [number, number];
  boundaryStatus?: BoundaryStatus;
  stressLevel?: RiskLevel;
  editorMode?: 'VERIFY' | 'CREATE' | 'NONE';
  onPolygonChange?: (polygon: GeoPolygon) => void;
  onVerifyBoundary?: (body: BoundaryVerifyBody) => Promise<void>;
}

function FitBoundsHelper({
  polygon,
  fallbackCenter,
}: {
  polygon: GeoPolygon | null;
  fallbackCenter: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (polygon && polygon.coordinates[0] && polygon.coordinates[0].length >= 3) {
      const latLngs = polygon.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number]);
      map.fitBounds(latLngs, { padding: [40, 40], maxZoom: 17 });
    } else {
      map.setView(fallbackCenter, 16);
    }
  }, [polygon, fallbackCenter, map]);

  return null;
}

function DrawClickCatcher({
  active,
  onAddPoint,
}: {
  active: boolean;
  onAddPoint: (pt: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (!active) return;
      onAddPoint([
        Math.round(e.latlng.lat * 1000000) / 1000000,
        Math.round(e.latlng.lng * 1000000) / 1000000,
      ]);
    },
  });
  return null;
}

export function FieldMap({
  polygon,
  center = [20.3899, 78.1307],
  boundaryStatus = 'UNVERIFIED',
  stressLevel = 'LOW',
  editorMode = 'VERIFY',
  onPolygonChange,
  onVerifyBoundary,
}: FieldMapProps) {
  const colors = useThemeColors();
  const [localPoly, setLocalPoly] = useState<GeoPolygon | null>(polygon);
  const [drawing, setDrawing] = useState(editorMode === 'CREATE' && !polygon);
  const [draftVertices, setDraftVertices] = useState<[number, number][]>([]);

  useEffect(() => {
    setLocalPoly(polygon);
  }, [polygon]);

  const activePoly = localPoly;
  const ha = activePoly ? areaHa(activePoly) : 0;
  const acres = haToAcres(ha);
  const px = pixelCount10m(ha);
  const sc = sizeClass(ha);
  const mapCenter = activePoly ? centroid(activePoly) : center;

  const strokeColor =
    boundaryStatus === 'WORKER_VERIFIED'
      ? colors.success
      : boundaryStatus === 'DISPUTED'
        ? colors.danger
        : colors.warning;

  const dashArray = boundaryStatus === 'WORKER_VERIFIED' ? undefined : '6 6';
  const fillColor = colors.risk[stressLevel];

  const leafletPositions: [number, number][] =
    activePoly?.coordinates[0]?.map(([lon, lat]) => [lat, lon]) ?? [];

  return (
    <div className="space-y-3">
      <div className="relative h-[340px] rounded-card overflow-hidden border border-line bg-surface-2">
        {/* Top-left overlay chips */}
        <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-1.5">
          <Badge
            tone={
              boundaryStatus === 'WORKER_VERIFIED'
                ? 'success'
                : boundaryStatus === 'DISPUTED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {boundaryStatus}
          </Badge>
          {activePoly && (
            <span className="px-2 py-0.5 rounded-ctl bg-surface/90 border border-line text-[11px] font-mono font-semibold text-ink">
              {ha.toFixed(2)} ha ({acres.toFixed(2)} acres) · ~{px} px ({sc})
            </span>
          )}
        </div>

        {/* Top-right ScaleBadge + DataBadge */}
        <div className="absolute top-3 right-3 z-[400] flex items-center gap-1.5">
          <ScaleBadge scale="FIELD_SENTINEL2_10M" />
          <DataBadge status="SIMULATED" source="Esri World Imagery + Sentinel-2 10 m" />
        </div>

        <MapContainer
          center={mapCenter}
          zoom={16}
          scrollWheelZoom
          className="w-full h-full z-0"
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
          />
          <FitBoundsHelper polygon={activePoly} fallbackCenter={center} />
          <DrawClickCatcher
            active={drawing}
            onAddPoint={(pt) => setDraftVertices((prev) => [...prev, pt])}
          />

          {!drawing && leafletPositions.length >= 3 && (
            <Polygon
              positions={leafletPositions}
              pathOptions={{
                color: strokeColor,
                weight: 3,
                dashArray,
                fillColor,
                fillOpacity: 0.25,
              }}
            />
          )}

          {drawing && draftVertices.length > 0 && (
            <>
              <Polyline
                positions={[...draftVertices, draftVertices[0]]}
                pathOptions={{
                  color: colors.accent,
                  weight: 2.5,
                  dashArray: '4 4',
                }}
              />
              {draftVertices.map((pt, idx) => (
                <CircleMarker
                  key={idx}
                  center={pt}
                  radius={5}
                  pathOptions={{
                    color: colors.surface,
                    weight: 2,
                    fillColor: colors.accent,
                    fillOpacity: 1,
                  }}
                />
              ))}
            </>
          )}
        </MapContainer>
      </div>

      {editorMode !== 'NONE' && (
        <BoundaryEditor
          mode={editorMode}
          drawing={drawing}
          draftVertices={draftVertices}
          currentPolygon={activePoly}
          onStartDraw={() => {
            setDraftVertices([]);
            setDrawing(true);
          }}
          onFinishDraw={(newPoly) => {
            setLocalPoly(newPoly);
            setDrawing(false);
            setDraftVertices([]);
            onPolygonChange?.(newPoly);
          }}
          onCancelDraw={() => {
            setDrawing(false);
            setDraftVertices([]);
          }}
          onVerify={onVerifyBoundary}
        />
      )}
    </div>
  );
}
