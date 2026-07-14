import styles from './scroll-world.module.css';

/**
 * /world 各場景的分層 SVG 微景觀（BRAND_BOOK 八色系統）。
 *
 * 每景固定三層：far（遠景）／mid（主體）／near（前景框）——三層各自有
 * translateZ 偏移（見 CSS module），相機前進時產生層間視差；near 層在
 * 穿越時放大掠過鏡頭，構成「飛入場景內部」的視覺。場景本身透明、
 * 只有美術飄浮在共用深色舞台上（scroll-world 去背飄浮場景的等價物）。
 */
const C = {
  ink: '#1A2E1F',
  cream: '#F4ECD8',
  ember: '#C2542E',
  moss: '#5E7A4F',
  brass: '#B08D3E',
  sage: '#A8B09E',
  sand: '#EBE1C7',
  umber: '#2A2422',
} as const;

type LayerProps = { children: React.ReactNode; depth: 'far' | 'mid' | 'near' };

function Layer({ children, depth }: LayerProps) {
  const cls = depth === 'far' ? styles.layerFar : depth === 'mid' ? styles.layerMid : styles.layerNear;
  return (
    <svg
      className={`${styles.layer} ${cls}`}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Stars({ seedY = 0 }: { seedY?: number }) {
  const pts = [
    [120, 90], [340, 150], [520, 60], [760, 120], [980, 70], [1180, 160], [1330, 90],
    [220, 240], [640, 210], [1080, 250], [880, 180], [420, 300],
  ];
  return (
    <g fill={C.sand}>
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y + seedY} r={i % 3 === 0 ? 2.2 : 1.4} opacity={0.25 + (i % 4) * 0.12} />
      ))}
    </g>
  );
}

function IntroArt() {
  return (
    <>
      <Layer depth="far">
        <Stars />
        <ellipse cx="720" cy="700" rx="820" ry="180" fill={C.brass} opacity="0.10" />
        <polygon points="150,690 320,600 480,690" fill={C.ink} opacity="0.75" />
        <polygon points="960,700 1140,590 1320,700" fill={C.ink} opacity="0.7" />
      </Layer>
      <Layer depth="mid">
        <ellipse cx="720" cy="760" rx="560" ry="60" fill={C.umber} opacity="0.85" />
        <polygon points="380,720 560,430 660,560 760,380 900,540 1060,720" fill={C.ink} />
        <polygon points="640,560 760,380 830,470 720,600" fill={C.moss} opacity="0.85" />
        <polygon points="740,400 760,380 800,430 770,450" fill={C.sand} opacity="0.9" />
        <ellipse cx="720" cy="805" rx="430" ry="26" fill={C.brass} opacity="0.16" />
      </Layer>
      <Layer depth="near">
        <rect x="-40" y="620" width="620" height="46" rx="23" fill={C.sage} opacity="0.07" />
        <rect x="880" y="560" width="640" height="42" rx="21" fill={C.sage} opacity="0.06" />
        <path d="M410 250 q14 -14 28 0 q14 -14 28 0" stroke={C.sand} strokeWidth="3" fill="none" opacity="0.6" />
        <path d="M1010 210 q12 -12 24 0 q12 -12 24 0" stroke={C.sand} strokeWidth="3" fill="none" opacity="0.5" />
      </Layer>
    </>
  );
}

function MountainArt() {
  return (
    <>
      <Layer depth="far">
        <circle cx="1080" cy="230" r="86" fill={C.brass} opacity="0.5" />
        <polygon points="0,640 260,440 520,620 780,430 1060,630 1300,470 1440,600 1440,900 0,900" fill={C.sage} opacity="0.35" />
      </Layer>
      <Layer depth="mid">
        <polygon points="60,860 420,360 640,700 900,300 1200,860" fill={C.moss} />
        <polygon points="420,360 640,700 540,760 380,520" fill={C.ink} opacity="0.55" />
        <polygon points="900,300 1050,560 960,640 860,420" fill={C.ink} opacity="0.5" />
        <polygon points="880,330 900,300 950,390 910,410" fill={C.cream} opacity="0.9" />
        <polygon points="400,395 420,360 465,430 430,455" fill={C.cream} opacity="0.85" />
        <rect x="0" y="560" width="1440" height="34" fill={C.sand} opacity="0.05" rx="17" />
      </Layer>
      <Layer depth="near">
        <polygon points="-20,900 240,660 520,900" fill={C.umber} />
        <polygon points="920,900 1180,640 1460,900" fill={C.umber} />
        <polygon points="180,740 210,690 240,740" fill={C.ink} />
        <polygon points="260,760 295,700 330,760" fill={C.ink} />
        <polygon points="1120,750 1155,690 1190,750" fill={C.ink} />
      </Layer>
    </>
  );
}

function RiverArt() {
  return (
    <>
      <Layer depth="far">
        <polygon points="0,900 0,300 480,520 260,900" fill={C.ink} opacity="0.8" />
        <polygon points="1440,900 1440,260 940,500 1200,900" fill={C.ink} opacity="0.85" />
        <rect x="300" y="330" width="840" height="30" rx="15" fill={C.sage} opacity="0.08" />
      </Layer>
      <Layer depth="mid">
        <path d="M700 380 C 640 480 840 540 760 640 C 690 730 900 790 820 900 L 560 900 C 640 800 460 740 540 650 C 610 570 470 480 560 380 Z" fill={C.sage} opacity="0.75" />
        <path d="M660 420 C 620 500 780 560 720 640" stroke={C.cream} strokeWidth="6" fill="none" opacity="0.5" />
        <ellipse cx="470" cy="700" rx="70" ry="42" fill={C.umber} />
        <ellipse cx="930" cy="620" rx="58" ry="36" fill={C.umber} opacity="0.9" />
        <ellipse cx="880" cy="810" rx="84" ry="48" fill={C.ink} />
      </Layer>
      <Layer depth="near">
        <ellipse cx="180" cy="880" rx="230" ry="120" fill={C.umber} />
        <ellipse cx="1280" cy="900" rx="260" ry="130" fill={C.umber} />
        <circle cx="640" cy="560" r="4" fill={C.cream} opacity="0.8" />
        <circle cx="700" cy="500" r="3" fill={C.cream} opacity="0.6" />
        <circle cx="760" cy="600" r="3.4" fill={C.cream} opacity="0.7" />
      </Layer>
    </>
  );
}

function CaveArt() {
  return (
    <>
      <Layer depth="far">
        <polygon points="620,0 880,0 1020,900 480,900" fill={C.sand} opacity="0.10" />
        <polygon points="680,0 820,0 920,900 580,900" fill={C.brass} opacity="0.12" />
        <g fill={C.sand}>
          <circle cx="700" cy="320" r="2.4" opacity="0.5" />
          <circle cx="770" cy="450" r="1.8" opacity="0.45" />
          <circle cx="820" cy="260" r="2" opacity="0.4" />
          <circle cx="660" cy="560" r="1.6" opacity="0.4" />
        </g>
      </Layer>
      <Layer depth="mid">
        <polygon points="560,900 610,720 660,900" fill={C.umber} />
        <polygon points="840,900 900,690 960,900" fill={C.umber} />
        <polygon points="700,900 745,780 790,900" fill={C.ink} />
        <ellipse cx="750" cy="880" rx="240" ry="34" fill={C.brass} opacity="0.14" />
      </Layer>
      <Layer depth="near">
        <path d="M0 0 H1440 V900 H0 Z M 320 180 C 520 40 920 40 1120 180 C 1240 280 1280 560 1180 900 L 260 900 C 160 560 200 280 320 180 Z" fill={C.umber} fillRule="evenodd" />
        <polygon points="430,120 470,340 510,120" fill={C.umber} />
        <polygon points="640,70 675,300 710,70" fill={C.umber} />
        <polygon points="900,90 935,330 970,90" fill={C.umber} />
        <polygon points="1090,140 1120,320 1150,140" fill={C.umber} />
      </Layer>
    </>
  );
}

function CultureArt() {
  return (
    <>
      <Layer depth="far">
        <Stars seedY={20} />
        <rect x="80" y="620" width="180" height="130" fill={C.ink} opacity="0.7" />
        <rect x="1180" y="600" width="200" height="150" fill={C.ink} opacity="0.7" />
        <rect x="300" y="660" width="120" height="90" fill={C.ink} opacity="0.55" />
      </Layer>
      <Layer depth="mid">
        <path d="M400 470 Q 720 380 1040 470 L 990 430 Q 720 350 450 430 Z" fill={C.ink} />
        <path d="M470 430 Q 720 360 970 430 L 940 560 L 500 560 Z" fill={C.umber} />
        <rect x="540" y="560" width="36" height="220" fill={C.ink} />
        <rect x="864" y="560" width="36" height="220" fill={C.ink} />
        <rect x="660" y="580" width="120" height="200" fill={C.ember} opacity="0.85" />
        <rect x="690" y="600" width="60" height="180" fill={C.brass} opacity="0.9" />
        <ellipse cx="720" cy="820" rx="380" ry="30" fill={C.brass} opacity="0.12" />
      </Layer>
      <Layer depth="near">
        <g>
          <line x1="150" y1="0" x2="150" y2="130" stroke={C.umber} strokeWidth="4" />
          <circle cx="150" cy="180" r="52" fill={C.ember} />
          <circle cx="150" cy="180" r="52" fill={C.brass} opacity="0.25" />
          <rect x="128" y="124" width="44" height="12" rx="6" fill={C.brass} />
        </g>
        <g>
          <line x1="1290" y1="0" x2="1290" y2="90" stroke={C.umber} strokeWidth="4" />
          <circle cx="1290" cy="145" r="58" fill={C.ember} />
          <rect x="1266" y="84" width="48" height="12" rx="6" fill={C.brass} />
        </g>
        <g>
          <line x1="720" y1="0" x2="720" y2="46" stroke={C.umber} strokeWidth="3" />
          <circle cx="720" cy="88" r="42" fill={C.ember} opacity="0.95" />
          <rect x="702" y="42" width="36" height="10" rx="5" fill={C.brass} />
        </g>
      </Layer>
    </>
  );
}

function EcologyArt() {
  return (
    <>
      <Layer depth="far">
        <rect x="200" y="0" width="46" height="900" fill={C.ink} opacity="0.6" />
        <rect x="440" y="0" width="60" height="900" fill={C.ink} opacity="0.75" />
        <rect x="950" y="0" width="52" height="900" fill={C.ink} opacity="0.7" />
        <rect x="1200" y="0" width="70" height="900" fill={C.ink} opacity="0.8" />
        <polygon points="620,0 760,0 700,900 660,900" fill={C.sand} opacity="0.08" />
      </Layer>
      <Layer depth="mid">
        <path d="M300 900 q80 -240 260 -300 q-40 200 -140 300 Z" fill={C.moss} opacity="0.9" />
        <path d="M1140 900 q-90 -220 -280 -280 q60 190 170 280 Z" fill={C.moss} opacity="0.85" />
        <path d="M660 900 q40 -160 160 -200 q-20 130 -90 200 Z" fill={C.sage} opacity="0.6" />
        <ellipse cx="720" cy="880" rx="420" ry="30" fill={C.ink} opacity="0.6" />
      </Layer>
      <Layer depth="near">
        <path d="M-20 900 Q 160 640 60 420 Q 220 600 240 900 Z" fill={C.ink} />
        <path d="M1460 900 Q 1290 660 1390 440 Q 1230 620 1210 900 Z" fill={C.ink} />
        <g fill={C.brass}>
          <circle cx="380" cy="520" r="5" opacity="0.9" />
          <circle cx="540" cy="620" r="3.6" opacity="0.7" />
          <circle cx="860" cy="560" r="4.4" opacity="0.8" />
          <circle cx="1020" cy="470" r="3.2" opacity="0.6" />
          <circle cx="700" cy="430" r="3.8" opacity="0.75" />
        </g>
      </Layer>
    </>
  );
}

function FinaleArt() {
  return (
    <>
      <Layer depth="far">
        <circle cx="720" cy="600" r="150" fill={C.ember} opacity="0.9" />
        <circle cx="720" cy="600" r="210" fill={C.brass} opacity="0.25" />
        <rect x="0" y="600" width="1440" height="300" fill={C.ink} opacity="0.9" />
      </Layer>
      <Layer depth="mid">
        <polygon points="620,700 720,610 820,700 780,700 720,650 660,700" fill={C.brass} opacity="0.5" />
        <rect x="80" y="640" width="300" height="8" rx="4" fill={C.sand} opacity="0.25" />
        <rect x="1080" y="660" width="280" height="8" rx="4" fill={C.sand} opacity="0.22" />
        <rect x="480" y="700" width="480" height="8" rx="4" fill={C.brass} opacity="0.4" />
        <path d="M660 760 h120 l-24 34 h-72 Z" fill={C.umber} />
        <line x1="720" y1="700" x2="720" y2="760" stroke={C.umber} strokeWidth="5" />
        <polygon points="720,706 720,752 762,752" fill={C.sand} opacity="0.9" />
      </Layer>
      <Layer depth="near">
        <rect x="-60" y="180" width="560" height="40" rx="20" fill={C.sage} opacity="0.06" />
        <rect x="960" y="240" width="560" height="36" rx="18" fill={C.sage} opacity="0.05" />
      </Layer>
    </>
  );
}

const ART: Record<string, () => React.ReactNode> = {
  intro: IntroArt,
  mountain: MountainArt,
  river: RiverArt,
  cave: CaveArt,
  culture: CultureArt,
  ecology: EcologyArt,
  finale: FinaleArt,
};

export function SceneArt({ art }: { art: string }) {
  const Art = ART[art];
  return Art ? <Art /> : null;
}
