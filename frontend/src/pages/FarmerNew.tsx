import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { createFarmer, getDistricts } from '@/api/client';
import type { DistrictSummary, GeoPolygon, Language } from '@/api/contract';
import { FieldMap } from '@/components/domain/FieldMap';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleGate } from '@/components/ui/RoleGate';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { Select } from '@/components/ui/Select';
import { areaHa, makeRectangle, pixelCount10m, sizeClass } from '@/lib/geo';

const CROPS = ['Cotton', 'Wheat', 'Rice', 'Soybean', 'Sugarcane', 'Mustard'] as const;
const LANGUAGES: Language[] = ['Marathi', 'Hindi', 'Punjabi', 'English'];

export default function FarmerNew() {
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+919000000013');
  const [language, setLanguage] = useState<Language>('Marathi');
  const [village, setVillage] = useState('');
  const [districtId, setDistrictId] = useState('yavatmal');
  const [crop, setCrop] = useState<string>('Cotton');
  const [sowingDate, setSowingDate] = useState('2026-06-18');
  const [consentSms, setConsentSms] = useState(true);
  const [polygon, setPolygon] = useState<GeoPolygon | null>(() =>
    makeRectangle(20.3899 + 0.01, 78.1307 + 0.01, 1.15, 1.4, 10),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getDistricts()
      .then((res) => {
        setDistricts(res.districts);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const selectedDistrict = districts.find((d) => d.id === districtId);
  const mapCenter: [number, number] = selectedDistrict
    ? [selectedDistrict.lat + 0.01, selectedDistrict.lon + 0.01]
    : [20.3999, 78.1407];

  const handleDistrictChange = (newDistId: string) => {
    setDistrictId(newDistId);
    const dist = districts.find((d) => d.id === newDistId);
    if (dist) {
      setLanguage(dist.language);
      setCrop(dist.primaryCrop);
      setPolygon(makeRectangle(dist.lat + 0.01, dist.lon + 0.01, 1.15, 1.4, 10));
    }
  };

  const ha = polygon ? areaHa(polygon) : 0;
  const sc = sizeClass(ha);
  const px = pixelCount10m(ha);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!polygon) {
      toast.error('Please draw and finish a field boundary polygon on the map.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createFarmer({
        name,
        phone,
        language,
        village,
        districtId,
        crop,
        sowingDate,
        consentSms,
        polygon,
      });
      toast.success(`Registered farmer ${created.name} (${created.id})`);
      navigate(`/farmers/${created.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Field Registration · Extension Worker"
        title="Register Farmer & Field Parcel Polygon"
        description="Register a farmer record and draw their parcel boundary on 10 m satellite imagery. Small-field resolution limits are evaluated live."
        badges={
          <>
            <ScaleBadge scale="FIELD_SENTINEL2_10M" />
            <DataBadge status="MANUAL" />
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/farmers')}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Back to Farmers
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Left (5 cols) */}
        <Card className="lg:col-span-5 space-y-4" eyebrow="Farmer Details" title="Registration Form">
          <Input
            label="Farmer Full Name *"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mahesh Deshmukh"
          />
          <Input
            label="Mobile Number (Masked in UI) *"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            hint="Only the last 2 digits are shown in the department UI (+91 90xxxx00NN)."
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="District *"
              value={districtId}
              onChange={(e) => handleDistrictChange(e.target.value)}
            >
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.district} ({d.state})
                </option>
              ))}
            </Select>
            <Input
              label="Village *"
              required
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              placeholder="e.g. Kalamb"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Primary Crop *"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
            >
              {CROPS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              label="SMS Language *"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>

          <Input
            type="date"
            label="Sowing Date *"
            required
            value={sowingDate}
            onChange={(e) => setSowingDate(e.target.value)}
          />

          <label className="p-3.5 rounded-ctl bg-surface-2 border border-line flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentSms}
              onChange={(e) => setConsentSms(e.target.checked)}
              className="w-4 h-4 accent-primary mt-0.5 cursor-pointer"
            />
            <span className="text-xs text-ink leading-relaxed">
              Farmer agreed to receive SMS from the Agriculture Department. They can stop
              anytime.
            </span>
          </label>

          <div className="pt-2">
            <RoleGate
              action="farmer.register"
              extraDisableReason={!polygon ? 'Draw a field polygon on the map first' : null}
            >
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                icon={<CheckCircle2 className="w-4 h-4" />}
                className="w-full justify-center"
              >
                Register Farmer & Parcel
              </Button>
            </RoleGate>
          </div>
        </Card>

        {/* FieldMap Right (7 cols) */}
        <Card
          className="lg:col-span-7 space-y-4"
          eyebrow="Parcel Boundary Drawing (Required)"
          title="Sentinel-2 10 m Field Polygon"
          actions={
            <Badge
              tone={
                sc === 'ADEQUATE' ? 'success' : sc === 'SMALL' ? 'warning' : 'danger'
              }
            >
              {ha.toFixed(2)} ha · ~{px} px · {sc}
            </Badge>
          }
        >
          <FieldMap
            polygon={polygon}
            center={mapCenter}
            boundaryStatus="UNVERIFIED"
            stressLevel="LOW"
            editorMode="CREATE"
            onPolygonChange={(newPoly) => setPolygon(newPoly)}
          />

          {(sc === 'SMALL' || sc === 'TOO_SMALL') && (
            <div className="p-3.5 rounded-ctl bg-warning/15 border border-warning/40 text-xs text-ink flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <strong>
                  {sc === 'TOO_SMALL'
                    ? 'Parcel Too Small (< 0.10 ha / < 10 pixels):'
                    : 'Small Parcel Warning (< 0.50 ha / < 50 pixels):'}
                </strong>{' '}
                {sc === 'TOO_SMALL'
                  ? 'Sentinel-2 10 m pixels cannot reliably monitor plots under 0.10 ha. Satellite stress scoring will abstain and require ground inspection.'
                  : 'Border pixels mix with neighbouring plots and bunds. Satellite stress reliability will be capped at LOW.'}
              </div>
            </div>
          )}
        </Card>
      </form>
    </div>
  );
}
