export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  success: string;
  successMuted: string;
  warning: string;
  danger: string;
  /** Set-type accents */
  warmup: string;
  failure: string;
  drop: string;
  /** Chart series palette, in order */
  chart: string[];
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: (n: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  font: {
    size: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number; display: number };
    weight: { regular: '400'; medium: '500'; semibold: '600'; bold: '700'; heavy: '800' };
  };
}

const base = {
  spacing: (n: number) => n * 4,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  font: {
    size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, display: 34 },
    weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
  },
} as const;

export const darkTheme: Theme = {
  ...base,
  dark: true,
  colors: {
    background: '#0E0F12',
    surface: '#17191E',
    surfaceAlt: '#20232A',
    border: '#2B2F37',
    text: '#F2F3F5',
    textMuted: '#A0A6B1',
    textFaint: '#6B717C',
    primary: '#E5484D',
    primaryMuted: '#3B1A1C',
    onPrimary: '#FFFFFF',
    success: '#30A46C',
    successMuted: '#16301F',
    warning: '#F5A524',
    danger: '#FF6369',
    warmup: '#F5A524',
    failure: '#FF6369',
    drop: '#8E7CF8',
    chart: ['#E5484D', '#3E9BFF', '#30A46C', '#F5A524', '#8E7CF8', '#2EC8C8'],
  },
};

export const lightTheme: Theme = {
  ...base,
  dark: false,
  colors: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF0F3',
    border: '#DDE1E6',
    text: '#111317',
    textMuted: '#5A616C',
    textFaint: '#8C929C',
    primary: '#D93A40',
    primaryMuted: '#FBE4E5',
    onPrimary: '#FFFFFF',
    success: '#218358',
    successMuted: '#DDF3E6',
    warning: '#C27C0E',
    danger: '#D4262D',
    warmup: '#C27C0E',
    failure: '#D4262D',
    drop: '#6E56CF',
    chart: ['#D93A40', '#1F7AE0', '#218358', '#C27C0E', '#6E56CF', '#0E9C9C'],
  },
};
