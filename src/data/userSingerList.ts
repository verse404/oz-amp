export type WatchlistGroupKey =
  | 'A - C'
  | 'D - F'
  | 'G - J'
  | 'K - M'
  | 'N - S'
  | 'T - Z & Others'
  | 'Chinese Artists';

export interface WatchlistSingerEntry {
  id: string;
  displayName: string;
  matchTerms: string[];
  group: WatchlistGroupKey;
  isChinese: boolean;
  tourContextNote?: string;
}

export const WATCHLIST_GROUPS: WatchlistGroupKey[] = [
  'A - C',
  'D - F',
  'G - J',
  'K - M',
  'N - S',
  'T - Z & Others',
  'Chinese Artists',
];

const RAW_UPLOADED_GROUPS: Record<WatchlistGroupKey, string[]> = {
  'A - C': [
    'A.CHAL',
    'Aaron Smith',
    'Aaron Taylor',
    'ABBA',
    'ACE TEE',
    'Airling',
    'AJR',
    'Alexander 23',
    'Alfie Templeman',
    'Alina Baraz',
    'Alt-J',
    'AlunaGeorge',
    'Anderson .Paak',
    'Angel Haze',
    'Anna of the North',
    'Anthony Russo',
    'Arctic Monkeys',
    'Arin Ray',
    'Ashe',
    'Atwood',
    'Audrey Mika',
    'AUGUST 08',
    'BADBADNOTGOOD',
    'Bao The Whale',
    'bbno$',
    'Bea Miller',
    'Bearcubs',
    'Beast Sounds',
    'Bebe Rexha',
    'Benny Blanco',
    'Benny Sings',
    'BIBI',
    'Billie Eilish',
    'Breakbot',
    'Bruno Major',
    'Bryant Barnes',
    'Cailin Russo',
    'Calum Scott',
    'CamelPhat',
    'Cameron Gainley',
    'Carey Mulligan',
    'Carpetman',
    'Cautious Clay',
    'CHANYEOL',
    'Chet Faker',
    'Childish Gambino',
    'Chris Brown',
    'Christopher Blake',
    'Cobach Party',
    'CORBAL',
    'Cory Wong',
    'Céza (or CéU)',
  ],
  'D - F': [
    "D'Angelo",
    'Daddy Yankee',
    'Daft Punk',
    'Daniel Caesar',
    'Daniel Wilson',
    'Daniela Andrade',
    'David Kushner',
    'Deep Water (水太深)',
    'Delta Goodrem',
    'Dennis Lloyd',
    'Disclosure',
    'DJ Licious',
    'DJ Snake',
    'DNCE',
    'Doja Cat',
    'DPR IAN',
    'DRAMA',
    'Duke Dumont',
    'Dyo',
    'E^ST',
    'Ekali',
    'Elderbrook',
    'Elena Vos',
    'elkkle',
    'Else',
    'Emilee',
    'Emma Peters',
    'Eric Nam',
    'Eric Tyler',
    'Eskimo Joe',
    'Ezio Bosso',
    'Far East Movement',
    'Fedde Le Grand',
    'Felix Jaehn',
    'Feng Suave',
    'Finding Hope',
    'Fireboy DML',
    'FKA twigs',
    'FKJ',
    'Flight Facilities',
    'Flume',
    'Fly By Midnight',
    'Foals',
    'Foreign Air',
    'Frankey & Sandrino',
    'Freddie Gibbs',
    'Friday Night Plans',
    'Future',
  ],
  'G - J': [
    'Galantis',
    'Galimatias',
    'Gallant',
    'Gang Of Youths',
    'Geowulf',
    'Generationals',
    'Giselle',
    'GIVĒON',
    'Glasses',
    'Glue70',
    'Golden Vessel',
    'Gracie Abrams',
    'Great Good Fine OK',
    'Greg Shilling',
    'Grigoré',
    'Guy Sebastian',
    'H.E.R.',
    'Herb Alpert & the Tijuana Brass',
    'HIGH HOOPS',
    'Higher Brothers',
    'HONNE',
    'Honey Mooncie',
    'Hotel Ugly',
    'Hozier',
    'HUGEL',
    'Ida Corr',
    'Illa J',
    'ilplstrtd',
    'J Balvin',
    'J. Cole',
    'Jaguar Jaguar',
    'James Hersey',
    'Japanese Wallpaper',
    'Jax Jones',
    'Jayla Darden',
    'Jazmin Sparta',
    'Jeremy Zucker',
    'Jerry Folk',
    'Jet',
    'Jhené Aiko',
    'Jingo',
    'Johnny Stimson',
    'John Legend',
    'John Mayer',
    'Joji',
    'Jon Batiste',
    'Jordan Rakei',
    'Josh Fudge',
    'June Marieezy',
    'Jungle',
    'Justin Bieber',
    'Justin Timberlake',
  ],
  'K - M': [
    'Kali Uchis',
    'Kartell',
    'KATIE',
    'Kazy Lambist',
    'khai dreams',
    'Khalid',
    'KISS OF LIFE',
    'koji.',
    'Krono',
    'Kwam.E',
    "L'Impératrice",
    'LaKesha Nugent',
    'Lana Del Rey',
    'LEISURE',
    'Lexy Panterra',
    'Linkin Park',
    'Lizzo',
    'Luke Chiang',
    'Mac Ayres',
    'Maja Kristina',
    'Major Lazer',
    'Mallrat',
    'Marshmello',
    'maye',
    'Mel Blue',
    'Metro Boomin',
    'Metroplane',
    'Mickey Blue',
    'Michl',
    'Midnight',
    'Miguel',
    'Millie Turner',
    'Mitski',
    'Monaldin',
    'Monsune',
    'Moonchild',
    'Moses Sumney',
    'Motel 7',
    'Mr Twin Sister',
    'Mr.Kitty',
    'MØ',
  ],
  'N - S': [
    'Nate Rose',
    'NEIKED',
    'Nick Jonas',
    'Nika',
    'NIKI',
    'Normani',
    'Of Monsters And Men',
    'Oh Wonder',
    'Olivia Dean',
    'Omarion',
    'Paul Jackson Jr',
    'Pink Sweat$',
    'PLAZA',
    'PREP',
    'R. Kelly',
    'R3HAB',
    'reggie',
    'Reuben James',
    'ricewine',
    'Rich Brian',
    'Rick Ross',
    'Roger Sanchez',
    'Ruck P',
    'Rudimental',
    'Sam Smith',
    'Sam Wills',
    'Samuel T. Herring',
    'Sarah',
    'Saweetie',
    'Sebastian Mikael',
    'Selena Gomez',
    'Sex Chill',
    'SG Lewis',
    'Shiloh Dynasty',
    'Skrillex',
    'slenderbodies',
    'Snake City',
    'spring gang',
    'SRNO',
    'Stark Sands',
    'steelix',
    'Stephen Day',
    'Sub Urban',
    'Surf Mesa',
    'Swae Lee',
  ],
  'T - Z & Others': [
    'Tai Verdes',
    'TEED (Totally Enormous Extinct Dinosaurs)',
    'Tems',
    'The fin.',
    'The Marías',
    'The Rubens',
    'The xx',
    'Tinashe',
    'Tito Lopez',
    'Tom Misch',
    'Toploader',
    'TRA$HH',
    'Tripolism',
    'TSUNANO',
    'Two Feet',
    'Tying Tiffany',
    'Videoclub',
    'wave to earth',
    'WENDY',
    'What So Not',
    'WhoMadeWho',
    'Wildson',
    'WILLOW',
    'Wings',
    'XXXTENTACION',
    'Young Rog',
    'ZHU',
    '88rising',
    '6LACK',
  ],
  'Chinese Artists': [
    '常石磊 (Chang Shilei)',
    '拖鞋 (T-T / T-Crash)',
    '刘思鉴 (Liu Sijian)',
    '橘子海 (Orange Ocean)',
    '无实物艺术团 (Wushiwu Art Group)',
    '袁娅维 (TIA RAY)',
    '魏如萱 (Waa Wei)',
    '伊尔盼 (Erpan)',
  ],
};

const SPECIAL_CONTEXT_NOTES: Record<string, string> = {
  'Anderson .Paak':
    'Confirmed in BOTH Melbourne (Marvel Stadium Feb 19–24, 2027) & Sydney (Accor Stadium Mar 4–9, 2027) performing as DJ Pee .Wee on Bruno Mars’s Romantic Tour!',
  'Daniel Caesar':
    'Nov 2026 Melbourne (Rod Laver) & Sydney (Qudos) shows were cancelled due to health — high-priority watch for 2027 rescheduled makeup sessions.',
  'Gracie Abrams':
    'Confirmed in BOTH Melbourne (Rod Laver Arena Jul 27–30, 2027) & Sydney (Qudos Arena Aug 3–6, 2027) — Priority Pre-Sale LIVE NOW & GP On-Sale Fri Nov 20!',
  'Flight Facilities':
    'Headlining New Year’s at the Bowl at Sidney Myer Music Bowl, Melbourne on Thu 31 Dec 2026 alongside Major Lazer & CC:DISCO! (no Sydney headline date announced yet).',
  'Major Lazer':
    'Confirmed in BOTH Melbourne (Sidney Myer Music Bowl NYE Dec 31, 2026) & Sydney (Field Day at The Domain Jan 1, 2027)!',
  Elderbrook:
    'Confirmed in Sydney at Field Day 2027 (Fri 1 Jan 2027 at The Domain, Sydney CBD).',
  'Roger Sanchez':
    'Confirmed in BOTH Melbourne (Sidney Myer Music Bowl Dec 12, 2026) & Sydney (The Domain Dec 5, 2026) at Ministry of Sound: Summer Dance!',
  FKJ: 'Confirmed in BOTH Melbourne (Festival Hall, Feb 26, 2027) & Sydney (Hordern Pavilion, Feb 24, 2027) on the Tyber Tour.',
  'J. Cole':
    'Confirmed in BOTH Melbourne (Rod Laver Arena Nov 28–29, 2026) & Sydney (Qudos Bank Arena Dec 1–2, 2026) on The Fall-Off World Tour.',
  'Jordan Rakei':
    'Confirmed in BOTH Melbourne (Forum Melbourne Dec 10, 2026) & Sydney (Tumbalong Park FORMA Open-Air Dec 6, 2026).',
  Jungle:
    'Confirmed in BOTH Melbourne (Rod Laver Arena Mar 6, 2027) & Sydney (Qudos Bank Arena Mar 4, 2027) on the Sunshine Arena Tour.',
  'Swae Lee':
    'Confirmed in BOTH Melbourne (Forum Melbourne Jan 6, 2027) & Sydney (Enmore Theatre Jan 8, 2027) on the Same Difference Tour.',
  'SG Lewis':
    'Wrapped his Anemoia Australian club shows earlier in Nov 2026 (170 Russell MEL & Metro SYD) — no upcoming late-2026/2027 Australian dates scheduled yet.',
  BADBADNOTGOOD:
    'Completed March 2026 Australian national tour; watching for next Melbourne & Sydney return.',
  'Freddie Gibbs':
    'Completed October 2026 Last Rabbit Australian tour; watching for next AU dates.',
  'Of Monsters And Men':
    'Played Palais Theatre Melbourne & Enmore Sydney in May 2026; watching for 2027 return.',
  CamelPhat:
    'Played Melbourne (RIVA) & Sydney (Carriageworks) in Jan 2026; watching Untitled Group for next summer tour.',
  'Linkin Park':
    'Completed March 2026 From Zero Australian arena run (Melbourne & Sydney); watching for next AU leg.',
  'Olivia Dean':
    'Completed October 2026 Art Of Loving arena tour (Rod Laver & Qudos); watching for 2027 festival/encore return.',
  Mitski:
    'Played 4-night Sydney Opera House residency in May/June 2026; watching closely for a Melbourne headline date.',
  'Childish Gambino':
    '2025 Australian leg was cancelled — watching Frontier & Live Nation for rescheduled Melbourne/Sydney dates.',
  'wave to earth':
    'Played Forum Melbourne & Enmore Sydney on the 0.03 Tour; watching for 2027 Australian return.',
  ZHU: 'Played Melbourne (170 Russell) & Sydney (Roundhouse) in April 2026; watching for next club/festival run.',
  'Billie Eilish':
    'Played 8 Melbourne & Sydney arena nights on Hit Me Hard and Soft; monitoring next album cycle.',
};

const EXTRA_MATCH_ALIASES: Record<string, string[]> = {
  'Anderson .Paak': ['Anderson Paak', 'DJ Pee .Wee', 'Silk Sonic'],
  'Céza (or CéU)': ['Céza', 'Ceza', 'CéU', 'Ceu'],
  'Deep Water (水太深)': ['Deep Water', '水太深'],
  GIVĒON: ['Giveon'],
  "L'Impératrice": ['L Imperatrice', 'Limperatrice'],
  'The Marías': ['The Marias'],
  'TEED (Totally Enormous Extinct Dinosaurs)': [
    'TEED',
    'Totally Enormous Extinct Dinosaurs',
  ],
  '常石磊 (Chang Shilei)': ['常石磊', 'Chang Shilei'],
  '拖鞋 (T-T / T-Crash)': ['拖鞋', 'T-Crash'],
  '刘思鉴 (Liu Sijian)': ['刘思鉴', 'Liu Sijian'],
  '橘子海 (Orange Ocean)': ['橘子海', 'Orange Ocean'],
  '无实物艺术团 (Wushiwu Art Group)': ['无实物艺术团', 'Wushiwu Art Group'],
  '袁娅维 (TIA RAY)': ['袁娅维', 'TIA RAY', 'Tia Ray'],
  '魏如萱 (Waa Wei)': ['魏如萱', 'Waa Wei'],
  '伊尔盼 (Erpan)': ['伊尔盼', 'Erpan'],
};

function buildMatchTerms(rawName: string): string[] {
  const base = rawName.trim();
  const extra = EXTRA_MATCH_ALIASES[base] || [];
  // Strip parenthetical note for clean query matching when appropriate
  const withoutParens = base.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const set = new Set<string>([base, ...extra]);
  if (withoutParens && withoutParens.length >= 2) {
    set.add(withoutParens);
  }
  return Array.from(set);
}

export const UPLOADED_WATCHLIST_SINGERS: WatchlistSingerEntry[] = WATCHLIST_GROUPS.flatMap(
  (group) =>
    RAW_UPLOADED_GROUPS[group].map((rawName, idx) => {
      const isChinese =
        group === 'Chinese Artists' ||
        rawName === 'Deep Water (水太深)' ||
        rawName === 'Higher Brothers';
      const slug = rawName
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '');
      return {
        id: `wl-${group.slice(0, 1).toLowerCase()}-${idx}-${slug}`,
        displayName: rawName,
        matchTerms: buildMatchTerms(rawName),
        group,
        isChinese,
        tourContextNote: SPECIAL_CONTEXT_NOTES[rawName],
      };
    }),
);

export function parseCustomWatchlistInput(rawText: string): WatchlistSingerEntry[] {
  const ignoredHeaders = new Set([
    'a - c',
    'd - f',
    'g - j',
    'k - m',
    'n - s',
    't - z & others',
    'chinese artists',
  ]);
  const lines = rawText
    .split(/[\r\n,;]+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 80 && !ignoredHeaders.has(l.toLowerCase()));

  return lines.map((name, idx) => {
    const hasHan = /[\u3400-\u4dbf\u4e00-\u9fff]/.test(name);
    const firstChar = name.charAt(0).toUpperCase();
    let group: WatchlistGroupKey = 'T - Z & Others';
    if (hasHan) group = 'Chinese Artists';
    else if (firstChar >= 'A' && firstChar <= 'C') group = 'A - C';
    else if (firstChar >= 'D' && firstChar <= 'F') group = 'D - F';
    else if (firstChar >= 'G' && firstChar <= 'J') group = 'G - J';
    else if (firstChar >= 'K' && firstChar <= 'M') group = 'K - M';
    else if (firstChar >= 'N' && firstChar <= 'S') group = 'N - S';

    return {
      id: `wl-custom-${Date.now().toString(36)}-${idx}`,
      displayName: name,
      matchTerms: buildMatchTerms(name),
      group,
      isChinese: hasHan,
    };
  });
}
