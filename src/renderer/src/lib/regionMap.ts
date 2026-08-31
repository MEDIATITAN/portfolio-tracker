/**
 * Grobe Region je Land. Schlüssel ist die englische Schreibweise von Yahoo (assetProfile.country);
 * onvistas deutsche Ländernamen werden vorher darauf übersetzt (siehe shared/countries.ts), damit
 * ETF-Anteile und Einzelaktien desselben Landes zusammenfallen.
 */
const COUNTRY_TO_REGION: Record<string, string> = {
  'United States': 'Nordamerika',
  Canada: 'Nordamerika',
  Mexico: 'Nordamerika',
  Germany: 'Europa',
  France: 'Europa',
  'United Kingdom': 'Europa',
  Switzerland: 'Europa',
  Netherlands: 'Europa',
  Spain: 'Europa',
  Italy: 'Europa',
  Sweden: 'Europa',
  Denmark: 'Europa',
  Norway: 'Europa',
  Finland: 'Europa',
  Belgium: 'Europa',
  Austria: 'Europa',
  Ireland: 'Europa',
  Luxembourg: 'Europa',
  Portugal: 'Europa',
  Poland: 'Europa',
  Greece: 'Europa',
  'Czech Republic': 'Europa',
  Hungary: 'Europa',
  Cyprus: 'Europa',
  // Türkei liegt geografisch auf zwei Kontinenten; in Fondsberichten wird sie üblicherweise
  // Europa zugeschlagen, dem folgt diese Zuordnung.
  Turkey: 'Europa',
  Japan: 'Asien',
  China: 'Asien',
  'Hong Kong': 'Asien',
  Taiwan: 'Asien',
  'South Korea': 'Asien',
  India: 'Asien',
  Singapore: 'Asien',
  Indonesia: 'Asien',
  Malaysia: 'Asien',
  Thailand: 'Asien',
  Philippines: 'Asien',
  Australia: 'Ozeanien',
  'New Zealand': 'Ozeanien',
  Brazil: 'Südamerika',
  Argentina: 'Südamerika',
  Chile: 'Südamerika',
  Peru: 'Südamerika',
  Colombia: 'Südamerika',
  Israel: 'Naher Osten',
  Qatar: 'Naher Osten',
  Kuwait: 'Naher Osten',
  'Saudi Arabia': 'Naher Osten',
  'United Arab Emirates': 'Naher Osten',
  'South Africa': 'Afrika',
  // Reine Registrierungssitze ohne Geschäftsbetrieb vor Ort (Reedereien, China-Holdings). Sie
  // bleiben absichtlich unzugeordnet und landen in "Sonstige", statt eine Region vorzutäuschen.
  Liberia: 'Sonstige',
  'Cayman Islands': 'Sonstige'
}

export function countryToRegion(country: string | null | undefined): string {
  if (!country) return 'Unbekannt'
  return COUNTRY_TO_REGION[country] ?? 'Sonstige'
}
