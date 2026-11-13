/* krt2.wicki.aero – Beispielkonfiguration «Beispiel Zürich» zum Ausprobieren des Editors.
   Werte aus dem Datenstand 13.11.2026 (openAIP-Export CH, OurAirports), nicht geprüft – Beispiel, keine Flugvorbereitung. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.KRT2SAMPLE = factory(root.KRT2MODEL);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  const STANDORT = { name: 'CH-Zürich (Flughafen)', lat: 47.458, lon: 8.548 };
  const AD = {
    LSZH: { icao: 'LSZH', iata: 'ZRH', name: 'Zürich', lat: 47.458, lon: 8.548 },
    LSZF: { icao: 'LSZF', iata: '', code: 'BIR', name: 'Birrfeld', lat: 47.444, lon: 8.234 },
    LSZK: { icao: 'LSZK', iata: '', code: 'SPE', name: 'Speck-Fehraltorf', lat: 47.376, lon: 8.758 },
    LSPH: { icao: 'LSPH', iata: '', code: 'WIN', name: 'Winterthur', lat: 47.515, lon: 8.772 },
    LSZB: { icao: 'LSZB', iata: 'BRN', name: 'Bern-Belp', lat: 46.912, lon: 7.499 },
    LSMD: { icao: 'LSMD', iata: '', code: 'DUB', name: 'Dübendorf', lat: 47.399, lon: 8.648 }
  };
  // [Frequenz, Dienst, Klartext, Ort, Quellen, Vertrauen, Hinweis, Zusatz]
  const ROWS = [
    ['124.700', 'FIS', 'Zurich INFO', { code: 'ZRH', name: 'Zürich' }, ['openAIP', 'OurAirports'], 'g', '', { lage: 'gebiet' }],
    ['123.555', 'RDO', 'Birrfeld AD', AD.LSZF, ['openAIP', 'OurAirports'], 'g', 'OurAirports: 123.550 (25-kHz-Angabe derselben Frequenz)'],
    ['120.355', 'RDO', 'Speck-Fehraltorf AD', AD.LSZK, ['openAIP', 'OurAirports'], 'g', 'OurAirports: 120.350 (25-kHz-Angabe)'],
    ['134.980', 'RDO', 'Winterthur AD', AD.LSPH, ['openAIP', 'OurAirports'], 'g', 'OurAirports: 134.975 (25-kHz-Angabe)', { aktiv: false }],
    ['134.680', 'INFO', 'Bale INFO', { code: 'BSL', name: 'Basel' }, ['openAIP'], 'y', 'nur Luftraum TMA BALE', { lage: 'angrenzend' }],
    ['127.755', 'APP', 'Zurich APP (Terminal)', AD.LSZH, ['openAIP', 'OurAirports'], 'g', ''],
    ['118.100', 'TWR', 'Zurich TWR', AD.LSZH, ['openAIP', 'OurAirports'], 'g', ''],
    ['125.730', 'ATIS', 'Zurich ATIS (ARR)', AD.LSZH, ['openAIP', 'OurAirports'], 'g', 'OurAirports: 125.725 (25-kHz-Angabe)'],
    ['127.325', 'APP', 'Bern APP', AD.LSZB, ['openAIP', 'OurAirports'], 'g', ''],
    ['121.030', 'TWR', 'Bern TWR', AD.LSZB, ['openAIP', 'OurAirports'], 'g', ''],
    ['133.900', 'RDR', 'Zurich RDR East', { code: 'ZRH', qual: 'E', name: 'Zürich' }, ['OurAirports'], 'y', 'nur OurAirports', { lage: 'gebiet' }],
    ['135.680', 'RDR', 'Zurich RDR West', { code: 'ZRH', qual: 'W', name: 'Zürich' }, ['OurAirports'], 'y', 'OurAirports: 135.68 (nur zwei Nachkommastellen)', { lage: 'gebiet' }],
    ['136.155', 'RDR', 'Zurich RDR North', { code: 'ZRH', qual: 'N', name: 'Zürich' }, ['OurAirports'], 'y', 'nur OurAirports', { lage: 'gebiet' }],
    ['118.975', 'MIL', 'Dübendorf MIL TWR', AD.LSMD, ['openAIP'], 'y', ''],
    ['119.225', 'RDR', 'Alps RDR (MIL ON)', { code: 'ALP', name: 'Alps' }, ['openAIP'], 'y', 'Luftraum CTA ZUERICH ALPS', { lage: 'angrenzend' }],
    ['121.905', 'GND', 'Zurich GND', AD.LSZH, ['openAIP'], 'y', 'OurAirports: 121.902 (kein gültiger Kanal)'],
    ['121.930', 'DEL', 'Zurich DEL', AD.LSZH, ['openAIP', 'OurAirports'], 'g', 'OurAirports: 121.925 (25-kHz-Angabe)']
  ];
  function sampleConfig() {
    const cfg = M.defaultConfig();
    cfg.name = 'Beispiel Zürich';
    cfg.standort = Object.assign({}, STANDORT);
    cfg.datenStand = '2026-11-13';
    cfg.beispiel = true;
    for (const [ch, dienst, klar, ort, quellen, vertrauen, note, extra] of ROWS) {
      const o = Object.assign({}, ort);
      const x = extra || {};
      const dist = o.lat != null ? Math.round(M.distKm(STANDORT.lat, STANDORT.lon, o.lat, o.lon)) : x.lage === 'gebiet' ? 0 : null;
      M.addEntry(cfg, Object.assign({ ch, dienst, klar, ort: { icao: o.icao || '', iata: o.iata || '', code: o.code || '', qual: o.qual || '', name: o.name || '' }, quellen, vertrauen, note, dist, kurzModus: 'kurz' }, extra || {}));
    }
    cfg.bloecke.forEach(b => { if (b.order !== 'corridor') M.sortBlock(cfg, b.id); });
    return cfg;
  }
  return { sampleConfig };
});
