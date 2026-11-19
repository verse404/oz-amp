export type CityId = 'sydney' | 'melbourne';

export type VenueTier =
  | 'stadium'
  | 'arena'
  | 'outdoor'
  | 'theatre'
  | 'club'
  | 'festival';

export type TicketingAgency =
  | 'Ticketek'
  | 'Ticketmaster'
  | 'Moshtix'
  | 'Oztix'
  | 'Official Ballot';

export type PresaleKind =
  | 'Telstra Plus'
  | 'Frontier Members'
  | 'Live Nation'
  | 'Mastercard / Amex'
  | 'Artist / Spotify'
  | 'Venue / Promoter'
  | 'General On-Sale'
  | 'Official Resale';

export type SaleStatus =
  | 'presale-soon'
  | 'presale-live'
  | 'on-sale'
  | 'selling-fast'
  | 'waitlist-resale';

export interface TicketDropWindow {
  id: string;
  kind: PresaleKind;
  label: string;
  opensAtIso: string;
  closesAtIso?: string;
  codeHint?: string;
  bookingUrl: string;
}

export interface VenueInfo {
  id: string;
  name: string;
  city: CityId;
  state: 'NSW' | 'VIC';
  suburb: string;
  tier: VenueTier;
  capacity: number;
  primaryAgency: TicketingAgency;
  curfewLocal?: string;
  transitHint: string;
  lastTransitTip?: string;
  hotelAreaTip?: string;
  mapsQuery: string;
}

export interface ConcertEvent {
  id: string;
  artist: string;
  supportActs: string[];
  tourTitle?: string;
  city: CityId;
  venueId: string;
  venueName: string;
  suburb: string;
  venueTier: VenueTier;
  dateIso: string;
  additionalDates?: string[];
  doorsTimeLocal: string;
  setTimeLocal: string;
  timeZone: 'Australia/Sydney' | 'Australia/Melbourne';
  genres: string[];
  promoter: string;
  agency: TicketingAgency;
  status: SaleStatus;
  priceMinAud: number;
  priceMaxAud: number;
  ticketUrl: string;
  resaleUrl?: string;
  ticketDrops: TicketDropWindow[];
  editorialNote: string;
  isCustom?: boolean;
  sourceTag?: string;
}

export interface TourNewsItem {
  id: string;
  headline: string;
  source: string;
  publishedAtIso: string;
  url: string;
  citiesMentioned: CityId[];
}

export interface FestivalSlot {
  artist: string;
  stage: string;
  start: string;
  end: string;
}

export interface FestivalSideshowOption {
  artist: string;
  sydneyVenue: string;
  melbourneVenue: string;
  melbourneExclusiveFestival?: boolean;
  festivalOnly?: boolean;
  priceAud: number;
  agency: string;
}

export interface FestivalAdvisorItem {
  id: string;
  name: string;
  cities: Array<{ city: CityId; dateIso: string; venueName: string }>;
  festivalPassAud: number;
  agency: string;
  ticketUrl: string;
  slots: FestivalSlot[];
  sideshows: FestivalSideshowOption[];
}

export interface PresetSinger {
  name: string;
  category: 'Global Pop' | 'Mandopop & Cantopop' | 'K-Pop & J-Pop' | 'Indie, Rock & Electronic';
  aliases: string[];
  genre: string;
  origin: string;
  radarNote?: string;
}

export interface AuTicketingLinks {
  ticketek: string;
  ticketmaster: string;
  frontier: string;
  livenation: string;
  tixel: string;
}

export interface ArtistSearchProfile {
  name: string;
  aliases: string[];
  genre: string;
  origin: string;
  artworkUrl: string;
  upcomingAuCount: number;
  matchedCities: CityId[];
  auLinks: AuTicketingLinks;
}

export interface MonitoredSinger {
  name: string;
  aliases: string[];
  genre?: string;
  artworkUrl?: string;
  radarNote?: string;
  notifyOnAnnounce: boolean;
  addedAtIso: string;
  knownConcertIds: string[];
}

export interface SingerMonitorCheckResult {
  name: string;
  aliases: string[];
  status: 'announced' | 'rumour-or-news' | 'monitoring';
  matchedConcertIds: string[];
  matchedConcertsSummary: Array<{
    id: string;
    city: CityId;
    venueName: string;
    dateIso: string;
    status: SaleStatus;
  }>;
  radarNote?: string;
  breakingHeadlines: TourNewsItem[];
  auLinks: AuTicketingLinks;
}

export interface TicketStubRecord {
  id: string;
  concertId: string;
  artist: string;
  tourTitle?: string;
  city: CityId;
  venueName: string;
  dateIso: string;
  paidAud: number;
  sectionNote: string;
  venueRating: 1 | 2 | 3 | 4 | 5;
  status: 'secured' | 'attended';
  createdAtIso: string;
}

export interface MusicFestivalStop {
  city: CityId;
  state: 'NSW' | 'VIC';
  dateLabel: string;
  dateIso: string;
  venueName: string;
}

export interface MusicFestivalDirectoryItem {
  id: string;
  name: string;
  tagline: string;
  format: 'City Day Festival' | 'Multi-Day Camping';
  stops: MusicFestivalStop[];
  priceAud: number;
  status: SaleStatus;
  agency: string;
  lineupUrl: string;
  ticketUrl: string;
  lineupAnnounced?: boolean;
  headliners: string[];
  fullLineup: string[];
}

export interface CatalogPayload {
  syncedAtIso: string;
  liveSyncSource: string;
  ticketmasterConfigured: boolean;
  venues: VenueInfo[];
  concerts: ConcertEvent[];
  tourNews: TourNewsItem[];
  musicFestivals: MusicFestivalDirectoryItem[];
  festivals: FestivalAdvisorItem[];
  presetSingers: PresetSinger[];
}

export type WorldFestivalRegion =
  | 'North America'
  | 'Europe'
  | 'Asia'
  | 'Latin America'
  | 'Middle East & Africa'
  | 'Oceania';

export type WorldFestivalVibe =
  | 'Transformational & Art'
  | 'Electronic & Underground'
  | 'Indie, Rock & Nature'
  | 'Multi-Genre Iconic';

export interface WorldFestivalItem {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  region: WorldFestivalRegion;
  vibe: WorldFestivalVibe;
  datesLabel: string;
  startDateIso: string;
  endDateIso?: string;
  venueName: string;
  themeOrEdition?: string;
  status: 'lineup-live' | 'registration-soon' | 'ballot-upcoming' | 'sold-out-resale';
  statusLabel: string;
  passPriceApprox: string;
  melbourneFlightTip: string;
  sydneyFlightTip: string;
  imageUrl: string;
  officialUrl: string;
  ticketsUrl: string;
  lineupAnnounced: boolean;
  lineupHighlights: string[];
  stagesOrCamps: string[];
  nextSessionLabel: string;
  nextSessionIso: string;
  description: string;
  isCore?: boolean;
  isCustomAdded?: boolean;
}

export type LeadMinutes = 15 | 60 | 1440;

export interface ReminderRule {
  id: string;
  concertId: string;
  dropId?: string;
  artist: string;
  venueName: string;
  city: CityId;
  regionBadge?: string;
  targetType: 'presale' | 'onsale' | 'show-day' | 'production-hold' | 'hotel-lock';
  targetLabel: string;
  targetIso: string;
  leadMinutes: LeadMinutes;
  ticketUrl: string;
  firedOffsets: number[];
  createdAtIso: string;
}
