export interface ParsedAnnouncementResult {
  artist: string;
  tourTitle: string;
  concerts: unknown[];
  ticketDropsCount: number;
}

export declare function parseTourAnnouncement(rawInput: string): ParsedAnnouncementResult;
