import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLocale = 'en' | 'zh';

const LOCALE_STORAGE_KEY = 'oz_amp_locale_v1';

let activeLocaleRef: AppLocale = 'en';

function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'zh' || raw === 'en') {
      activeLocaleRef = raw;
      return raw;
    }
  } catch {
    // Ignore storage access restrictions
  }
  return 'en';
}

export function getActiveLocale(): AppLocale {
  return activeLocaleRef;
}

const GENRE_ZH_MAP: Record<string, string> = {
  'All Genres': '全部曲风',
  'All Vibes': '全部风格',
  'All Regions': '全球地区',
  'Indie & Alt': '独立与另类',
  Pop: '流行',
  Rock: '摇滚',
  'Hip-Hop & R&B': '说唱与 R&B',
  Electronic: '电子音乐',
  'Metal & Punk': '金属与朋克',
  Festival: '音乐节',
  'Folk & Soul': '民谣与灵魂乐',
  'Global Pop': '全球流行',
  'Indie, Rock & Electronic': '独立 / 摇滚 / 电子',
  'Mandopop & Cantopop': '华语流行',
  'K-Pop & J-Pop': '日韩流行',
  'Chinese Artists': '华语歌手',
  'City Day Festival': '城市单日音乐节',
  'Multi-Day Camping': '多日露营音乐节',
  'North America': '北美',
  Europe: '欧洲',
  Asia: '亚洲',
  'Latin America': '拉丁美洲',
  'Middle East & Africa': '中东与非洲',
  Oceania: '大洋洲',
  'Transformational & Art': '艺术与沉浸体验',
  'Electronic & Underground': '电子与地下音乐',
  'Indie, Rock & Nature': '独立 / 摇滚 / 自然',
  'Multi-Genre Iconic': '殿堂级综合音乐节',
  'All Hubs': '全部航点',
  Tokyo: '东京',
  Singapore: '新加坡',
  Bangkok: '曼谷',
  'Hong Kong': '香港',
  Auckland: '奥克兰',
};

const DROP_KIND_ZH_MAP: Record<string, string> = {
  'General On-Sale': '公开售票',
  'Artist Pre-Sale': '歌手粉丝预售',
  'Frontier Pre-Sale': 'Frontier 预售',
  'Live Nation Pre-Sale': 'Live Nation 预售',
  'Telstra Plus Pre-Sale': 'Telstra Plus 预售',
  'Amex Pre-Sale': 'Amex 会员预售',
  'Mastercard Pre-Sale': 'Mastercard 预售',
  'Venue Pre-Sale': '场馆会员预售',
  'Early Bird': '早鸟票',
  'Registration': '抽签 / 预注册',
};

export interface LocaleContextValue {
  locale: AppLocale;
  intlLocale: 'en-AU' | 'zh-CN';
  isZh: boolean;
  setLocale: (next: AppLocale) => void;
  toggleLocale: () => void;
  tr: (en: string, zh: string) => string;
  cityLabel: (city: 'melbourne' | 'sydney' | 'all', style?: 'full' | 'state' | 'short') => string;
  genreLabel: (raw: string) => string;
  dropKindLabel: (raw: string) => string;
  statusLabel: (status: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  const setLocale = useCallback((next: AppLocale) => {
    activeLocaleRef = next;
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(activeLocaleRef === 'en' ? 'zh' : 'en');
  }, [setLocale]);

  useEffect(() => {
    activeLocaleRef = locale;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : 'en-AU';
    }
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const isZh = locale === 'zh';
    const intlLocale: 'en-AU' | 'zh-CN' = isZh ? 'zh-CN' : 'en-AU';
    return {
      locale,
      intlLocale,
      isZh,
      setLocale,
      toggleLocale,
      tr: (en: string, zh: string) => (isZh ? zh : en),
      cityLabel: (city, style = 'full') => {
        if (city === 'melbourne') {
          if (style === 'short') return isZh ? '墨尔本' : 'MEL';
          if (style === 'state') return isZh ? '墨尔本 · VIC' : 'Melbourne · VIC';
          return isZh ? '墨尔本' : 'Melbourne';
        }
        if (city === 'sydney') {
          if (style === 'short') return isZh ? '悉尼' : 'SYD';
          if (style === 'state') return isZh ? '悉尼 · NSW' : 'Sydney · NSW';
          return isZh ? '悉尼' : 'Sydney';
        }
        if (style === 'short') return isZh ? '墨/悉' : 'MEL/SYD';
        return isZh ? '墨尔本 & 悉尼' : 'Both Cities';
      },
      genreLabel: (raw: string) => (isZh ? GENRE_ZH_MAP[raw] || raw : raw),
      dropKindLabel: (raw: string) => (isZh ? DROP_KIND_ZH_MAP[raw] || raw : raw),
      statusLabel: (status: string) => {
        if (!isZh) {
          switch (status) {
            case 'presale-live':
              return 'Pre-Sale Live';
            case 'presale-soon':
              return 'Pre-Sale Soon';
            case 'selling-fast':
              return 'Selling Fast';
            case 'waitlist-resale':
              return 'Waitlist / Resale';
            default:
              return 'On Sale';
          }
        }
        switch (status) {
          case 'presale-live':
            return '预售进行中';
          case 'presale-soon':
            return '即将预售';
          case 'selling-fast':
            return '余票紧张';
          case 'waitlist-resale':
            return '候补 / 官方转售';
          default:
            return '公开售票中';
        }
      },
    };
  }, [locale, setLocale, toggleLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return ctx;
}
