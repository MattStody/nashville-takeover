// Brand Guidelines (2026), light feel. Montserrat stands in for Gotham/Norsh
// until licensed font files are available; swap the families here only.
export const colors = {
  cream: '#F6EFCE',
  creamDeep: '#EDE3B8',
  paper: '#FFFCF0',
  darkTeal: '#1E3E41',
  teal: '#1F7E7B',
  orange: '#E7603F',
  muted: '#5B6E6F',
  line: '#E2D7AE',
  danger: '#B3261E',
  success: '#1F7E7B',
  white: '#FFFFFF',
} as const;

export const fonts = {
  body: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  bold: 'Montserrat_700Bold',
  headline: 'Montserrat_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 12, lg: 20 } as const;
