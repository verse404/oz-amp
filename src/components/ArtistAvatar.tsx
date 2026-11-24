import React, { useEffect, useState } from 'react';
import { ARTIST_PORTRAITS } from '../data/artistPortraits';

const RUNTIME_PORTRAIT_CACHE = new Map<string, string>();
const PENDING_NAMES = new Set<string>();
const LISTENERS = new Set<() => void>();
let batchTimer: number | null = null;

const MONOGRAM_PALETTES = [
  'linear-gradient(135deg, #c85a32 0%, #6b2414 100%)',
  'linear-gradient(135deg, #2d6a6a 0%, #143338 100%)',
  'linear-gradient(135deg, #8b5a2b 0%, #3a2310 100%)',
  'linear-gradient(135deg, #5d4777 0%, #241934 100%)',
  'linear-gradient(135deg, #3b5e8c 0%, #17273d 100%)',
  'linear-gradient(135deg, #9e3b4e 0%, #3d141d 100%)',
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getInitials(name: string): string {
  const clean = name.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
  if (!clean) return '♪';
  const hanMatch = clean.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/);
  if (hanMatch) {
    return clean.slice(0, 2);
  }
  const parts = clean.split(/[\s.&/-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function lookupStaticPortrait(rawName?: string): string {
  if (!rawName) return '';
  const base = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!base) return '';

  if (ARTIST_PORTRAITS[base]) return ARTIST_PORTRAITS[base];
  if (RUNTIME_PORTRAIT_CACHE.has(base)) return RUNTIME_PORTRAIT_CACHE.get(base) || '';

  if (base.includes('laneway festival')) return ARTIST_PORTRAITS['fontaines d.c.'] || '';
  if (base.includes('good things festival')) return ARTIST_PORTRAITS['limp bizkit'] || '';
  if (base.includes('meredith music festival')) return ARTIST_PORTRAITS['dijon'] || '';
  if (base.includes('golden plains')) return ARTIST_PORTRAITS['underworld'] || '';
  if (base.includes('summer dance') || base.includes('ministry of sound')) {
    return ARTIST_PORTRAITS['roger sanchez'] || '';
  }
  if (base.includes('beyond the valley')) return ARTIST_PORTRAITS['john summit'] || '';
  if (base.includes('lost paradise')) return ARTIST_PORTRAITS['skepta'] || '';
  if (base.includes('field day')) return ARTIST_PORTRAITS['major lazer'] || '';
  if (base.includes('let them eat cake')) return ARTIST_PORTRAITS['boys noize'] || '';
  if (base.includes('pitch music')) return ARTIST_PORTRAITS['haai'] || '';
  if (base.includes('ultra australia')) return ARTIST_PORTRAITS['calvin harris'] || '';
  if (base.includes('coachella')) {
    return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Coachella18W1-18_%2842058161311%29.jpg/960px-Coachella18W1-18_%2842058161311%29.jpg';
  }
  if (base.includes('tomorrowland')) {
    return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ed/Tomorrowland2016mainstage.jpg/960px-Tomorrowland2016mainstage.jpg';
  }
  if (base.includes('burning man')) {
    return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ec/Temple_du_Burning_Man_2016.jpg/960px-Temple_du_Burning_Man_2016.jpg';
  }
  if (base.includes('fuji rock')) {
    return 'https://upload.wikimedia.org/wikipedia/commons/d/d5/FujiGreenStage.jpg';
  }
  if (base.includes('wonderfruit')) {
    return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e1/Welcome_sign_at_Wonderfruit_festival.jpg/960px-Welcome_sign_at_Wonderfruit_festival.jpg';
  }
  if (base.includes('boom festival')) {
    return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Boom_Festival_1997.jpg/960px-Boom_Festival_1997.jpg';
  }

  const noBrackets = base.replace(/\s*\[[^\]]*\]\s*/g, '').trim();
  if (ARTIST_PORTRAITS[noBrackets]) return ARTIST_PORTRAITS[noBrackets];

  const noParens = noBrackets.replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (noParens && ARTIST_PORTRAITS[noParens]) return ARTIST_PORTRAITS[noParens];

  const parenInner = noBrackets.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (parenInner && ARTIST_PORTRAITS[parenInner]) return ARTIST_PORTRAITS[parenInner];

  if (noBrackets.includes(',')) {
    const first = noBrackets.split(',')[0].trim();
    if (ARTIST_PORTRAITS[first]) return ARTIST_PORTRAITS[first];
  }
  if (noBrackets.includes(' & ')) {
    const first = noBrackets.split(' & ')[0].trim();
    if (ARTIST_PORTRAITS[first]) return ARTIST_PORTRAITS[first];
  }

  return '';
}

function scheduleRuntimePortraitFetch(rawName: string) {
  const key = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || RUNTIME_PORTRAIT_CACHE.has(key)) return;
  PENDING_NAMES.add(rawName.trim());

  if (batchTimer !== null) return;
  batchTimer = window.setTimeout(async () => {
    batchTimer = null;
    const batch = Array.from(PENDING_NAMES).slice(0, 35);
    batch.forEach((n) => PENDING_NAMES.delete(n));
    if (batch.length === 0) return;

    try {
      const res = await fetch(
        `/api/artists/portraits?names=${encodeURIComponent(batch.join('|'))}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { portraits?: Record<string, string> };
        const map = data.portraits || {};
        for (const n of batch) {
          const k = n.toLowerCase().replace(/\s+/g, ' ');
          RUNTIME_PORTRAIT_CACHE.set(k, map[k] || '');
        }
        LISTENERS.forEach((fn) => fn());
      } else {
        batch.forEach((n) =>
          RUNTIME_PORTRAIT_CACHE.set(n.toLowerCase().replace(/\s+/g, ' '), ''),
        );
      }
    } catch {
      batch.forEach((n) =>
        RUNTIME_PORTRAIT_CACHE.set(n.toLowerCase().replace(/\s+/g, ' '), ''),
      );
    }

    if (PENDING_NAMES.size > 0) {
      const nextFirst = PENDING_NAMES.values().next().value;
      if (nextFirst) scheduleRuntimePortraitFetch(nextFirst);
    }
  }, 180);
}

export function useArtistPortrait(name: string, explicitUrl?: string): string {
  const [, bump] = useState(0);

  const resolved =
    explicitUrl && explicitUrl.startsWith('https://')
      ? explicitUrl
      : lookupStaticPortrait(name);

  useEffect(() => {
    if (resolved || !name.trim()) return;
    const onUpdate = () => bump((n) => n + 1);
    LISTENERS.add(onUpdate);
    scheduleRuntimePortraitFetch(name);
    return () => {
      LISTENERS.delete(onUpdate);
    };
  }, [name, resolved]);

  return resolved;
}

export interface ArtistAvatarProps {
  name: string;
  explicitUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  className?: string;
}

export const ArtistAvatar: React.FC<ArtistAvatarProps> = ({
  name,
  explicitUrl,
  size = 'md',
  shape = 'rounded',
  className = '',
}) => {
  const portraitUrl = useArtistPortrait(name, explicitUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showImg = Boolean(portraitUrl && portraitUrl !== failedUrl);
  const palette = MONOGRAM_PALETTES[hashString(name) % MONOGRAM_PALETTES.length];
  const initials = getInitials(name);

  return (
    <span
      className={`sa-avatar sa-avatar--${size} sa-avatar--${shape} ${className}`.trim()}
      style={!showImg ? { background: palette } : undefined}
    >
      {showImg ? (
        <img
          src={portraitUrl}
          alt={name}
          className="sa-avatar-img"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(portraitUrl)}
        />
      ) : (
        <span className="sa-avatar-monogram" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
};

export interface ConcertMediaBannerProps {
  artist: string;
  tourTitle?: string;
  supportActs: string[];
}

export const ConcertMediaBanner: React.FC<ConcertMediaBannerProps> = ({
  artist,
  tourTitle,
  supportActs,
}) => {
  const portraitUrl = useArtistPortrait(artist);
  const [failedBgUrl, setFailedBgUrl] = useState<string | null>(null);
  const fallbackGrad = MONOGRAM_PALETTES[hashString(artist) % MONOGRAM_PALETTES.length];
  const showBgImg = Boolean(portraitUrl && portraitUrl !== failedBgUrl);

  return (
    <div className="gig-media-banner">
      {showBgImg ? (
        <img
          src={portraitUrl}
          alt=""
          aria-hidden="true"
          className="gig-media-backdrop-img"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedBgUrl(portraitUrl)}
        />
      ) : (
        <div
          className="gig-media-backdrop-fallback"
          style={{ background: fallbackGrad }}
          aria-hidden="true"
        />
      )}
      <div className="gig-media-scrim" aria-hidden="true" />

      <div className="gig-media-foreground">
        <ArtistAvatar name={artist} size="xl" shape="rounded" className="gig-hero-portrait" />

        <div className="gig-media-copy">
          <h2 className="gig-artist-name">{artist}</h2>
          {tourTitle && <p className="gig-tour-title">{tourTitle}</p>}
          {supportActs.length > 0 && (
            <div className="gig-supports-visual">
              <span className="support-prefix">with</span>
              <div className="gig-support-pills">
                {supportActs.slice(0, 3).map((act) => (
                  <span key={act} className="gig-support-chip">
                    <ArtistAvatar name={act} size="xs" shape="circle" />
                    <span>{act}</span>
                  </span>
                ))}
                {supportActs.length > 3 && (
                  <span className="gig-support-more">+{supportActs.length - 3} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
