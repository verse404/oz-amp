export interface VenueInsiderGuide {
  bestSectionTip: string;
  restrictedViewWarning: string;
  cloakAndMerchTip: string;
}

export const VENUE_INSIDER_TIPS: Record<string, VenueInsiderGuide> = {
  // ── MELBOURNE (VIC) ──
  'mel-marvel': {
    bestSectionTip:
      'Level 1 Lower Bowl (Aisles 11–18 or 33–40) gives elevated stadium sightlines above flat floor heads; Front GA Pod is best for B-stage catwalks.',
    restrictedViewWarning:
      'Level 3 back rows sit behind delay speaker towers and can experience boomy roof-closed echo — check if roof is open or closed.',
    cloakAndMerchTip:
      'Strict A4 (30×30cm) bag limit. External Gate 1/3 Bourke St merch marquees open ~2:00 PM on show day so you can drop merch at your hotel first.',
  },
  'mel-rodlaver': {
    bestSectionTip:
      'Sections 6–8 & 17–19 Lower Bowl sit dead-on to the soundboard mix; Lower Row A–M beats Rear Floor if you are under 175cm.',
    restrictedViewWarning:
      'Sections 1, 12, 13 & 24 sit sharp side-stage — main rear LED backdrop is angled away.',
    cloakAndMerchTip:
      'No backpacks larger than A4; free external cloaking huts sit outside Garden Square & Eastern Plaza. Main outdoor merch van opens ~3:30 PM.',
  },
  'mel-mca': {
    bestSectionTip:
      'Intimate steep bowl — almost zero bad seats! Sections 4–6 & 14–16 sit closest to stage eye-level with punchy arena acoustics.',
    restrictedViewWarning:
      'Upper side corners (Sections 1 & 19) lose sight of deep upstage visuals.',
    cloakAndMerchTip:
      'Same Melbourne Park A4 bag rule; use Olympic Blvd entrance for fastest security lane.',
  },
  'mel-johncain': {
    bestSectionTip:
      'Sections 7–10 & 22–25 Lower Bowl offer the clearest stereo balance; GA floor feels surprisingly close.',
    restrictedViewWarning:
      'High side seats behind the stage truss cut line can have hanging lighting rigs partially in frame.',
    cloakAndMerchTip:
      'Cloakroom outside Grandslam Oval entrance; merch lines upstairs on Concourse East move twice as fast as ground entry.',
  },
  'mel-rbg': {
    bestSectionTip:
      'Sloped amphitheatre lawn — claim a spot mid-lawn slightly left of FOH sound tent 45 mins after gates.',
    restrictedViewWarning:
      'Low camp chairs are often restricted to rear lawn zones; check event-specific chair height rules.',
    cloakAndMerchTip:
      'Pack a light waterproof layer & picnic rug; strict 10:30 PM outdoor curfew means headliners start promptly around 8:30–8:45 PM.',
  },
  'mel-bowl': {
    bestSectionTip:
      'Stalls & Terrace Boxes sit under the iconic canopy (weatherproof + crispest PA); Front Lawn Slope has magic city-skyline twilight views.',
    restrictedViewWarning:
      'Avoid sitting directly behind the central mixing tower on the mid-lawn.',
    cloakAndMerchTip:
      'Strict 10:30 PM Kings Domain curfew! Sealed plastic water bottles allowed; Gate 1 Linlithgow Ave merch booth has widest vinyl/poster stock.',
  },
  'mel-festhall': {
    bestSectionTip:
      'Elevated Side Terraces (Sections 4–5 & 12–13) give classic boxing-arena proximity right over the pit without floor crush.',
    restrictedViewWarning:
      'Back flat GA floor behind the sound desk can feel low if you arrive right before the headliner.',
    cloakAndMerchTip:
      'Paid cloakroom inside foyer (card only); grab merch on arrival as post-show Dudley St exit funnels directly outside.',
  },
  'mel-forum': {
    bestSectionTip:
      'Tiered stone booths & raised middle floor rail right in front of the FOH booth have the best sightlines in Australia under the starry ceiling.',
    restrictedViewWarning:
      'Upstairs Dress Circle requires specific Upstairs tickets on seated/split nights and sells out earliest.',
    cloakAndMerchTip:
      'Cloakroom immediately left inside Flinders St foyer ($5 card); arrive 20 mins before support to snag a tiered booth ledge.',
  },
  'mel-palais': {
    bestSectionTip:
      'Front Dress Circle (Rows A–F centre) and Orchestra Stalls Rows G–P deliver pristine heritage theatre acoustics.',
    restrictedViewWarning:
      'Back Stalls rows (Row AA+) sit beneath the deep Dress Circle overhang, clipping top stage lighting.',
    cloakAndMerchTip:
      'Small bag policy enforced; foyer merch queues wrap up the grand stairs — hit the upstairs lounge bar & merch stand instead.',
  },
  'mel-foreshore': {
    bestSectionTip:
      'Stand slightly bayside (stage right) for sunset sea breeze and faster bar/restroom turnaround.',
    restrictedViewWarning:
      'Flat coastal asphalt/grass ground — step back 15m from dense front pit for full stage sightline.',
    cloakAndMerchTip:
      '10:30 PM Bayside curfew; bring windproof jacket even in summer as Port Phillip Bay temp drops fast after 9:00 PM.',
  },
  'mel-northcote': {
    bestSectionTip:
      'Wrap-around Mezzanine Balcony front rail or the tiered floor steps mid-room give unobstructed views in a 1,500-cap room.',
    restrictedViewWarning:
      'Under-balcony side bar pockets have slightly muted high-end audio.',
    cloakAndMerchTip:
      'Coat check available near High St entry; merch table sits right by the front lounge.',
  },
  'mel-corner': {
    bestSectionTip:
      'Stand stage-left (away from the central structural pillars!) or arrive 30 mins before main set for front-centre floor.',
    restrictedViewWarning:
      'Famous load-bearing room pillars mid-floor block views if you arrive late — move forward past the pillar line!',
    cloakAndMerchTip:
      'Pre-show parma on the rooftop beer garden upstairs gives quickest internal access down to the bandroom when doors open.',
  },
  'mel-flemington': {
    bestSectionTip:
      'Angle between Main Stage 1 & 2 sound towers so you can pivot between alternating headliners without fighting cross-crowd bottlenecks.',
    restrictedViewWarning:
      'Flat festival turf — pick a slight rise near the grandstand side for distance sets.',
    cloakAndMerchTip:
      'Rent a locker early near Main Gate; free water refill stations sit beside medical tents.',
  },
  'mel-meredith': {
    bestSectionTip:
      'Natural sloped bushland Supernatural Amphitheatre — every single inch of the hill has a clear sightline to the lone stage!',
    restrictedViewWarning:
      'Strict "No Dickhead Policy" & zero commercial signage; avoid tall flags/totems blocking amphitheatre views.',
    cloakAndMerchTip:
      'BYO campout (no glass permitted!); bring 4-season sleeping layer for 4:00 AM bushland temperature dips.',
  },

  // ── SYDNEY (NSW) ──
  'syd-accor': {
    bestSectionTip:
      'Level 1 Stadium Bowl (Aisles 104–110 & 127–133) balances panoramic staging with punchy line-array audio.',
    restrictedViewWarning:
      'Level 6 high nosebleeds feel very distant and windy; rear flat GA behind delay towers relies heavily on video screens.',
    cloakAndMerchTip:
      'Strict A4 bag limit; Olympic Blvd outside merch trucks open ~1:00 PM. Event ticket includes free T7/Sydney Trains return travel!',
  },
  'syd-qudos': {
    bestSectionTip:
      'Lower Bowl Sections 3–6 & 16–19 sit right in the arena acoustic sweet spot; GA floor splits into Front & Rear on major pop tours.',
    restrictedViewWarning:
      'Upper Level Sections 51 & 76 sit steep side-stage where deep inner-stage screens cut off.',
    cloakAndMerchTip:
      'External cloaking marquee outside Northern Foyer; skip Ground Foyer merch queue and use Level 1 Concourse stands.',
  },
  'syd-soh-forecourt': {
    bestSectionTip:
      'Arrive 45 mins early to stand on the Monumental Steps terrace — natural tiered stone steps overlook both stage, Harbour Bridge & sunset!',
    restrictedViewWarning:
      'Flat lower tarmac gets crowded near front bar lanes; Steps offer far superior elevation.',
    cloakAndMerchTip:
      'Hard 10:00 PM harbour noise curfew (headliners often go on at 8:00–8:15 PM!). Security bag check at Lower Concourse.',
  },
  'syd-soh-hall': {
    bestSectionTip:
      'Following the acoustic renewal, Stalls Rows H–R and Circle Rows A–D offer world-reference orchestral & vocal clarity.',
    restrictedViewWarning:
      'Choir / Rear Stage seats look at the performer’s back (great for piano/intimate solo sets, less for full visual bands).',
    cloakAndMerchTip:
      'Complimentary cloaking at Western/Southern Foyers — large bags must be cloaked before entering the timber hall.',
  },
  'syd-domain': {
    bestSectionTip:
      'Position just ahead of the mid-field delay speakers on the gentle grassy rise toward Art Gallery Rd.',
    restrictedViewWarning:
      'Tree line along the outer perimeter partially obscures wide side-screens.',
    cloakAndMerchTip:
      '10:30 PM CBD curfew; exit via Martin Place Metro rather than St James to skip post-encore crowd queues.',
  },
  'syd-hordern': {
    bestSectionTip:
      'Freely choose between GA Standing Floor or unreserved Raked Tiered Seating Bowl with the same ticket on most shows — front row bowl centre is gold!',
    restrictedViewWarning:
      'Unreserved seats fill up by the main support act; claim seats early if you do not want floor standing.',
    cloakAndMerchTip:
      'Cloakroom & merch sit inside the entry rotunda; L2/L3 Moore Park Light Rail platform is a 4 min flat walk.',
  },
  'syd-icc': {
    bestSectionTip:
      'Fan-shaped modern amphitheatre — Stalls Middle Block & Lower Dress Circle (Sections 22–26) feel close with zero pillar obstructions.',
    restrictedViewWarning:
      'Extreme outer wings of Upper Terrace feel wide on solo acoustic staging.',
    cloakAndMerchTip:
      'Strict 30×30cm bag policy; Level 2 foyer merch stand is much quieter than Ground Level.',
  },
  'syd-tumbalong-park': {
    bestSectionTip:
      'Slightly elevated lawn lip toward Chinese Garden edge gives a clear sightline over the central standing crowd.',
    restrictedViewWarning:
      '10:30 PM Darling Harbour outdoor curfew; sets run strictly to schedule.',
    cloakAndMerchTip:
      'Easy post-show supper in Haymarket/Chinatown (4 min walk) while Town Hall train crowds clear.',
  },
  'syd-carriageworks': {
    bestSectionTip:
      'Industrial heritage rail bays — stand 10–15m ahead of the mixing booth for tightest sub-bass & laser projection framing.',
    restrictedViewWarning:
      'Wide warehouse bays: stay inside the central iron column corridor for full stage width.',
    cloakAndMerchTip:
      'Card-only bars & cloakroom inside Bay 17 foyer; 8 min flat walk back to Redfern Station.',
  },
  'syd-enmore': {
    bestSectionTip:
      'Gently sloped Art Deco carpet/timber floor means even rear GA standing has great sightlines! Dress Circle Row A–D is best seated view in Sydney.',
    restrictedViewWarning:
      'Back 3 rows of Stalls under the low balcony overhang lose upper lighting rig visibility.',
    cloakAndMerchTip:
      'Grab dinner on Enmore Rd / King St beforehand; cloakroom sits just inside right-hand lobby.',
  },
  'syd-metro': {
    bestSectionTip:
      'Two-tier sunken dancefloor — the raised mid-room balcony rail right behind the pit gives effortless close-up sightlines.',
    restrictedViewWarning:
      'Back bar level flattens out — step forward to the mid-tier rail 15 mins before set time.',
    cloakAndMerchTip:
      'Upstairs George St stairwell queues move fast; cloakroom & merch sit immediately at the top of the stairs.',
  },
  'syd-centennial': {
    bestSectionTip:
      'Brazilian Fields natural bowl — camp stage-left near shaded fig trees during afternoon sets, then move central for dusk headliners.',
    restrictedViewWarning:
      'Dusty/dewy parkland grass — wear closed sneakers/boots and pack a light shell.',
    cloakAndMerchTip:
      '10:30 PM curfew; walk out via Paddington/Oxford St or Randwick Light Rail gates to beat rideshare surge.',
  },
  'syd-showground': {
    bestSectionTip:
      'Main Arena grandstand ring lets you rest your legs with elevated views over the main dual stages between pit sets.',
    restrictedViewWarning:
      'Indoor Dome/Pavilion stages hit capacity during evening clashes — arrive 15 mins before set start.',
    cloakAndMerchTip:
      'Lockers inside Showground main concourse; Olympic Park T7 Sprint trains run continuously post-curfew.',
  },
};
