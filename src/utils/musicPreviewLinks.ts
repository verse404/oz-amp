export interface ArtistPreviewLinks {
  spotify: string;
  appleMusic: string;
  setlistFm: string;
}

export function buildArtistPreviewLinks(rawArtist: string): ArtistPreviewLinks {
  // Strip parenthetical billing notes for cleaner search accuracy
  const cleaned = rawArtist
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const q = encodeURIComponent(cleaned || rawArtist.trim());
  return {
    spotify: `https://open.spotify.com/search/${q}`,
    appleMusic: `https://music.apple.com/au/search?term=${q}`,
    setlistFm: `https://www.setlist.fm/search?query=${q}`,
  };
}
