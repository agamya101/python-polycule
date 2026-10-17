import { useTheme } from './useTheme';

export function ConceptBackdrop() {
  const { concept } = useTheme();

  return (
    <div className="fp-backdrop" aria-hidden>
      {concept === 'haryali' && (
        <svg
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full"
          fill="none"
          stroke="var(--fp-contour)"
          strokeWidth={1.2}
        >
          <path d="M-50 120 C120 60,260 180,420 110 S700 40,850 130" />
          <path d="M-50 170 C140 110,270 230,430 160 S690 90,850 180" />
          <path d="M-50 220 C150 165,280 280,440 210 S680 140,850 230" />
          <path d="M-50 400 C100 350,300 470,470 400 S720 330,850 420" />
          <path d="M-50 450 C110 400,310 520,480 450 S730 380,850 470" />
          <path d="M560 300 c40-30 110-20 120 20 s-30 70-80 60 s-80-50-40-80z" />
          <path d="M530 300 c50-60 170-50 185 25 s-50 110-130 95 s-110-60-55-120z" />
        </svg>
      )}
      {concept === 'sarson' && (
        <>
          <div
            className="absolute -top-16 right-10 w-72 h-72 rounded-full blur-2xl"
            style={{ background: 'var(--fp-sun)' }}
          />
          <svg
            className="absolute bottom-0 left-0 w-full h-[240px]"
            viewBox="0 0 1440 260"
            preserveAspectRatio="none"
          >
            <path
              d="M0 120 C240 60 480 160 720 110 S1200 60 1440 120 V260 H0Z"
              fill="var(--fp-hill-1)"
            />
            <path
              d="M0 170 C300 120 520 210 800 160 S1260 130 1440 180 V260 H0Z"
              fill="var(--fp-hill-2)"
            />
            <path
              d="M0 215 C260 185 560 245 860 210 S1300 195 1440 225 V260 H0Z"
              fill="var(--fp-hill-3)"
            />
          </svg>
        </>
      )}
    </div>
  );
}
