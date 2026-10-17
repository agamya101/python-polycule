import { useState } from 'react';
import { Check, Edit3, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { BoundaryVerifyBody, GeoPolygon } from '@/api/contract';
import { Button } from '@/components/ui/Button';
import { RoleGate } from '@/components/ui/RoleGate';
import { areaHa, pixelCount10m, sizeClass } from '@/lib/geo';

export interface BoundaryEditorProps {
  mode: 'VERIFY' | 'CREATE';
  drawing: boolean;
  draftVertices: [number, number][]; // [lat, lon]
  currentPolygon: GeoPolygon | null;
  onStartDraw: () => void;
  onFinishDraw: (polygon: GeoPolygon) => void;
  onCancelDraw: () => void;
  onVerify?: (body: BoundaryVerifyBody) => Promise<void>;
}

export function BoundaryEditor({
  mode,
  drawing,
  draftVertices,
  currentPolygon,
  onStartDraw,
  onFinishDraw,
  onCancelDraw,
  onVerify,
}: BoundaryEditorProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Compute live polygon from draftVertices if >= 3 points, else currentPolygon
  const previewPoly: GeoPolygon | null =
    drawing && draftVertices.length >= 3
      ? {
          type: 'Polygon',
          coordinates: [
            [
              ...draftVertices.map(([lat, lon]) => [lon, lat]),
              [draftVertices[0][1], draftVertices[0][0]],
            ],
          ],
        }
      : currentPolygon;

  const liveArea = previewPoly ? areaHa(previewPoly) : 0;
  const liveSize = sizeClass(liveArea);
  const livePixels = pixelCount10m(liveArea);

  const handleFinish = () => {
    if (draftVertices.length < 3) return;
    const closedRing = [
      ...draftVertices.map(([lat, lon]) => [lon, lat]),
      [draftVertices[0][1], draftVertices[0][0]],
    ];
    onFinishDraw({
      type: 'Polygon',
      coordinates: [closedRing],
    });
  };

  const handleVerifySubmit = async (status: 'WORKER_VERIFIED' | 'DISPUTED') => {
    if (!onVerify) return;
    setSubmitting(true);
    try {
      await onVerify({
        status,
        note: note.trim() || (status === 'WORKER_VERIFIED' ? 'Verified boundary on ground' : 'Boundary disputed'),
        polygon: currentPolygon,
      });
      setNote('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3.5 rounded-card bg-surface border border-line space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-bold text-ink">
            {drawing
              ? `Drawing polygon (${draftVertices.length} pts — click map to add)`
              : 'Parcel Boundary Controls'}
          </span>
          {previewPoly && (
            <span className="px-2 py-0.5 rounded-ctl bg-surface-2 border border-line text-ink">
              {liveArea.toFixed(2)} ha · ~{livePixels} px · {liveSize}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!drawing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onStartDraw}
              icon={<Edit3 className="w-3.5 h-3.5" />}
            >
              {currentPolygon ? 'Redraw Polygon' : 'Draw Field Polygon'}
            </Button>
          ) : (
            <>
              <Button
                variant="accent"
                size="sm"
                disabled={draftVertices.length < 3}
                onClick={handleFinish}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Finish ({draftVertices.length} pts)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelDraw}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {mode === 'VERIFY' && !drawing && onVerify && (
        <div className="pt-2 border-t border-line flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Verification note (required, e.g. walked bund perimeter with GPS)…"
            className="fp-input text-xs flex-1 py-1.5 px-2.5"
          />
          <div className="flex items-center gap-2 shrink-0">
            <RoleGate
              action="boundary.verify"
              extraDisableReason={!note.trim() ? 'Enter a verification note first' : null}
            >
              <Button
                variant="primary"
                size="sm"
                loading={submitting}
                onClick={() => handleVerifySubmit('WORKER_VERIFIED')}
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
              >
                Mark verified
              </Button>
            </RoleGate>
            <RoleGate
              action="boundary.verify"
              extraDisableReason={!note.trim() ? 'Enter a verification note first' : null}
            >
              <Button
                variant="danger"
                size="sm"
                loading={submitting}
                onClick={() => handleVerifySubmit('DISPUTED')}
                icon={<ShieldAlert className="w-3.5 h-3.5" />}
              >
                Mark disputed
              </Button>
            </RoleGate>
          </div>
        </div>
      )}
    </div>
  );
}
