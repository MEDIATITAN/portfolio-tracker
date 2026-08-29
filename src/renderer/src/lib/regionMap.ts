/** Grobe Region je Land, wie von Yahoo Finance (assetProfile.country) geliefert. */
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
  Japan: 'Asien',
  China: 'Asien',
  'Hong Kong': 'Asien',
  Taiwan: 'Asien',
  'South Korea': 'Asien',
  India: 'Asien',
  Singapore: 'Asien',
  Indonesia: 'Asien',
  Australia: 'Ozeanien',
  'New Zealand': 'Ozeanien',
  Brazil: 'Südamerika',
  Argentina: 'Südamerika',
  Chile: 'Südamerika',
  Israel: 'Naher Osten',
  'South Africa': 'Afrika'
}

export function countryToRegion(country: string | null | undefined): string {
  if (!country) return 'Unbekannt'
  return COUNTRY_TO_REGION[country] ?? 'Sonstige'
}
