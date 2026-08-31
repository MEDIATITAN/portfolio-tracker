/**
 * onvista liefert Länder auf Deutsch ("Großbritannien"), Yahoo auf Englisch ("United Kingdom").
 * Ohne Übersetzung würden Einzelaktien und ETF-Anteile desselben Landes als ZWEI Scheiben im
 * Regionen-Diagramm auftauchen. Kanonisch ist hier bewusst die englische Yahoo-Schreibweise, weil
 * die bereits in der Spalte positions.region gespeichert ist und in regionMap.ts nachgeschlagen wird.
 *
 * Die Liste stammt nicht aus dem Kopf, sondern aus den tatsächlich gelieferten Bezeichnungen: dafür
 * wurden die Länderaufteilungen mehrerer breit gestreuter Fonds (All-World, MSCI World, EM IMI,
 * STOXX Europe 600) plus der Fonds dieses Depots abgefragt und die Namen eingesammelt.
 */
const ONVISTA_TO_YAHOO: Record<string, string> = {
  Australien: 'Australia',
  Belgien: 'Belgium',
  Brasilien: 'Brazil',
  Chile: 'Chile',
  China: 'China',
  Dänemark: 'Denmark',
  Deutschland: 'Germany',
  Finnland: 'Finland',
  Frankreich: 'France',
  Griechenland: 'Greece',
  Großbritannien: 'United Kingdom',
  Hongkong: 'Hong Kong',
  Indien: 'India',
  Indonesien: 'Indonesia',
  Irland: 'Ireland',
  Israel: 'Israel',
  Italien: 'Italy',
  Japan: 'Japan',
  Kanada: 'Canada',
  Katar: 'Qatar',
  'Kayman Inseln': 'Cayman Islands',
  Kolumbien: 'Colombia',
  Kuwait: 'Kuwait',
  Liberia: 'Liberia',
  Luxemburg: 'Luxembourg',
  Malaysia: 'Malaysia',
  Mexiko: 'Mexico',
  Niederlande: 'Netherlands',
  Norwegen: 'Norway',
  Österreich: 'Austria',
  Peru: 'Peru',
  Philippinen: 'Philippines',
  Polen: 'Poland',
  Portugal: 'Portugal',
  'Saudi-Arabien': 'Saudi Arabia',
  Schweden: 'Sweden',
  Schweiz: 'Switzerland',
  Singapur: 'Singapore',
  Spanien: 'Spain',
  Südafrika: 'South Africa',
  Südkorea: 'South Korea',
  Taiwan: 'Taiwan',
  Thailand: 'Thailand',
  Tschechien: 'Czech Republic',
  Türkei: 'Turkey',
  Ungarn: 'Hungary',
  USA: 'United States',
  'Vereinigte Arabische Emirate': 'United Arab Emirates',
  Zypern: 'Cyprus'
}

/**
 * Barmittel sind kein Land. onvista führt sie in derselben Länderliste ("Barmittel",
 * "Barmittel und sonst. VM"), sie müssen vor der Auswertung heraus - sonst stünde im
 * Regionen-Diagramm ein Land namens "Barmittel".
 */
export function isCashLabel(label: string): boolean {
  return label.trim().toLowerCase().startsWith('barmittel')
}

/** Unbekannte Bezeichnungen bleiben unverändert - lieber ein deutscher Ländername als gar keiner. */
export function canonicalCountry(onvistaLabel: string): string {
  return ONVISTA_TO_YAHOO[onvistaLabel.trim()] ?? onvistaLabel.trim()
}
