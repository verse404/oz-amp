import type {
  CatalogPayload,
  ConcertEvent,
  FestivalAdvisorItem,
  MusicFestivalDirectoryItem,
  PresetSinger,
  TourNewsItem,
  VenueInfo,
} from '../types/gig';
import {
  VENUES,
  SEED_CONCERTS,
  SEED_TOUR_NEWS,
  MUSIC_FESTIVALS_DIRECTORY,
  FESTIVAL_ADVISOR_DATA,
  PRESET_SINGERS,
} from '../../server/seedCatalog.mjs';

export const FALLBACK_CATALOG: CatalogPayload = {
  syncedAtIso: '2026-11-18T05:25:00Z',
  liveSyncSource: 'Verified Sydney & Melbourne 2026–2027 Concert & Festival Slate',
  ticketmasterConfigured: false,
  venues: VENUES as VenueInfo[],
  concerts: SEED_CONCERTS as ConcertEvent[],
  tourNews: SEED_TOUR_NEWS as TourNewsItem[],
  musicFestivals: MUSIC_FESTIVALS_DIRECTORY as MusicFestivalDirectoryItem[],
  festivals: FESTIVAL_ADVISOR_DATA as FestivalAdvisorItem[],
  presetSingers: PRESET_SINGERS as PresetSinger[],
};
