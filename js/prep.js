// Voorbereiding, planning en begrippenlijst voor de montagehandleiding.
// Alles wordt afgeleid van het ontwerp: materiaal, verbinding, zaagservice, schuine kanten, naden, lades, deuren.
import { MATERIALS, JOINERY, plinthH } from './model.js';
import { hours as estHours, SERVICES } from './costs.js';

const INK = [30, 30, 30], MUTED = [130, 126, 118], ACC = [201, 115, 58], PALE = [242, 201, 168], LINE = [215, 210, 200];
const PW = 297, PH = 210, M = 12;
const clean = s => String(s).replace(/[^\x20-\x7E -ÿ×–°²→]/g, '').replace(/→/g, '>');

// ---------- analyse van het ontwerp ----------
export function analyse(d, geo) {
  const mats = new Set(geo.parts.filter(p => p.group !== 'lade').map(p => p.mat.type));
  const paint = [...mats].some(t => MATERIALS[t]?.paint);
  const mdf = mats.has('mdf_kleur');
  const veneer = [...mats].some(t => t === 'eiken' || t === 'noten');
  const plyBlank = [...mats].some(t => t === 'berken' || t === 'populier');
  const plyPaint = mats.has('multiplex_kleur');
  const mode = d.prices?.service?.mode || 'cnc';
  const J = d.joinery || 'deuvel';
  const bevels = geo.parts.filter(p => p.bevels?.length);
  const drawers = new Set(geo.parts.filter(p => p.group === 'lade').map(p => p.meta.drawer)).size;
  const doors = geo.parts.filter(p => p.group === 'front' && p.meta.type !== 'drawer').length;
  const tall = d.H > 1200;
  const h = estHours(d, geo, mode);
  return { paint, mdf, veneer, plyBlank, plyPaint, mode, J, bevels, drawers, doors, tall, h, seams: geo.seams?.length || 0, shaped: !!geo.dims.shaped, handles: geo.handles.length, plinth: plinthH(d) > 0 };
}

// ---------- stappenplan voorbereiding ----------
export function prepPhases(d, geo, A) {
  const svc = SERVICES[A.mode].label.toLowerCase();
  const P = [];
  // 1. bestanden en offerte
  P.push({
    title: 'Ontwerp vastzetten en bestanden aanleveren',
    when: 'Dag 1',
    items: [
      'Controleer de maten nog één keer ter plekke: nis, plinten, stopcontacten, schuine wanden.',
      A.mode === 'zelf'
        ? 'Je zaagt zelf: print de zaaglijst en de zaagplannen uit het project-PDF.'
        : `Stuur naar de ${svc}: het DXF-zaagbestand, het project-PDF (zaaglijst + zaagplannen) en dit document.`,
      ...(A.mode === 'cnc' ? ['Vermeld per DXF-laag wat er moet gebeuren: SNIJ = doorzagen/frezen, BOOR_A = boren van boven, BOOR_B = van de achterzijde (plaat omdraaien), POT = Ø35 × 12,5 mm diep.'] : []),
      ...(A.mode === 'zagen' ? ['Een zaagservice zaagt alleen rechte delen; alle gaten boor je zelf. Vraag of ze de nummers op de delen schrijven.'] : []),
      ...(A.bevels.length ? [`Er zijn ${A.bevels.length} delen met een schuine kant (laag AFSCHUINING). Vraag of de zaagservice die op de paneelzaag met kantelbaar blad kan zagen; een vlakbed-CNC kan dat niet.`] : []),
      ...(A.veneer || A.mdf ? ['Vraag om kantenband op de zichtkanten (fineer- of ABS-band) als de service dat aanbiedt; dat scheelt veel werk.'] : []),
      'Geef de nerfrichting door (staat in de zaaglijst en als pijl in de DXF) en vraag om een offerte met levertijd.',
    ],
  });
  P.push({
    title: 'Beslag, verf en gereedschap bestellen',
    when: 'Dag 1–3, tijdens de levertijd',
    items: [
      'Bestel het beslag volgens de beslaglijst; neem ongeveer 10% extra deuvels en schroeven.',
      ...(A.J === 'cabineo' ? ['Lamello Cabineo/Clamex: bestel ook de bijbehorende bit (T20) en eventueel de boormal.'] : []),
      ...(A.J === 'confirmat' ? ['Confirmat: koop een stapboor Ø5/Ø7 met verzinkkop en afdekdopjes in de kleur van de kast.'] : []),
      ...(A.J === 'deuvel' ? ['Deuvels: een deuvelmal (bijv. van Wolfcraft) en een diepte-aanslag voor de boor zijn onmisbaar voor de kopse gaten.'] : []),
      ...(A.paint ? ['Verf: watergedragen grondverf voor hout/MDF en watergedragen meubel- of interieurlak (zijdeglans of mat). Reken ca. 1 liter per 8 m2 per laag.'] : []),
      ...(A.plyBlank || A.veneer ? ['Afwerking: hardwax-olie (bijv. Osmo Polyx of Rubio Monocoat) of watergedragen blanke meubellak, mat.'] : []),
      'Schuurpapier korrel 120, 180 en 240, een schuurblok of excentrische schuurmachine, stofdoeken, afplaktape.',
    ],
  });
  P.push({
    title: 'Ontvangen en controleren',
    when: 'Na levering',
    items: [
      'Leg alle delen per nummer neer en vink ze af op de onderdelenlijst. Meet een paar delen na.',
      'Controleer of de gaten aan de juiste zijde zitten (zijde A/B) en of de diepte klopt.',
      'Laat platen plat en droog liggen, binnen, op latten; nooit tegen een muur laten staan (trekken krom).',
    ],
  });
  if (A.mode !== 'cnc' || A.bevels.length) P.push({
    title: 'Zelf zagen en boren',
    when: 'Voor het schuren',
    items: [
      ...(A.mode === 'zelf' ? ['Zaag met een invalzaag op een geleiderail of op een tafelzaag; zaag eerst ruim (+2 mm) en daarna op maat.', 'Zaag met de mooie zijde naar beneden bij een invalzaag, naar boven bij een tafelzaag (minder uitscheuren).'] : []),
      ...(A.bevels.length ? [
        `Schuine kanten (${A.bevels.length} delen): zet het zaagblad op de hoek uit de zaaglijst. "Lang aan zijde A" betekent dat zijde A, de zijde met de A-gaten, de lange punt houdt.`,
        'Maak eerst een proefsnede in een reststuk en controleer de aansluiting met een tweede reststuk.',
      ] : []),
      ...(A.mode !== 'cnc' ? ['Boor de vlakgaten met een boorstandaard of een mal; houd de maten uit de DXF aan (alle posities staan op de laag BOOR).', 'Scharnierpotten Ø35: gebruik een cilinderkopboor in een boorstandaard, diepte 12,5 mm, 22,5 mm uit de kant.'] : []),
    ],
  });
  // schuren en afwerken
  const glueTape = A.J === 'deuvel' ? ['Plak de lijmvlakken af (strook rond de deuvelgaten en de kopse kanten die gelijmd worden): lijm hecht niet op verf of olie.'] : [];
  if (A.paint) P.push({
    title: 'Schuren en schilderen, vóór de montage',
    when: 'Na het zagen en boren, voor het monteren',
    items: [
      'Schilder de delen plat liggend, vóór de montage. Dat geeft het strakste resultaat; montageschade later bijwerken.',
      ...(A.mdf ? ['MDF-kopse kanten zuigen verf op: eerst plamuren of afdichten met MDF-sealer, droog laten worden en glad schuren met korrel 240.'] : []),
      ...(A.plyPaint ? ['Kopse kanten van multiplex: kies of de laagjes zichtbaar mogen blijven (alleen schuren) of egaal moeten zijn (eerst dun plamuren en schuren).'] : []),
      'Schuur de vlakken met korrel 180 en breek de scherpe kanten licht met een schuurblok. Stofvrij maken.',
      ...glueTape,
      'Breng een laag grondverf aan met een fijne lakroller (vilt of schuim) en een kwast voor de kanten. Laat drogen volgens het blik, meestal 4 tot 6 uur.',
      'Tussenschuren met korrel 240, stof weg, dan twee lagen lak met minstens 6 tot 16 uur droogtijd ertussen. Licht tussenschuren voor de laatste laag.',
      'Verf niet in de scharnierpotten en de gaatjes; houd de gaten verfvrij met een wattenstaafje of een prop tape.',
      'Laat de lak minstens 2 tot 3 dagen uitharden voordat je krachtig klemt of de kast belast.',
    ],
  });
  if (A.plyBlank || A.veneer) P.push({
    title: A.paint ? 'Blank hout afwerken' : 'Schuren en afwerken',
    when: A.J === 'deuvel' ? 'Na het zagen; olie kan ook na de montage' : 'Na het zagen, vóór de montage',
    items: [
      ...(A.veneer ? ['Fineer is dun (± 0,6 mm): schuur alleen met de hand of heel licht met korrel 180, nooit grover en nooit op de kanten blijven hangen.'] : ['Schuur de vlakken met korrel 120 en daarna 180, in de richting van de nerf.']),
      'Breek alle kanten: één of twee halen met een schuurblok, of een afrondfrees R1 tot R2 in de bovenfrees.',
      ...(A.veneer ? ['Plak de kopse kanten af met fineerband (strijkijzer) als dat niet door de service gedaan is, en schuur de overstekken weg.'] : []),
      ...(A.J === 'deuvel'
        ? ['Bij deuvels: olie of lak bij voorkeur na de montage, dan blijven de lijmvlakken schoon. Wil je vooraf afwerken, plak dan de lijmvlakken af.']
        : ['Met schroefverbindingen kun je alles vooraf afwerken: makkelijker en zonder druppels in hoeken.']),
      'Hardwax-olie: dun aanbrengen met een pad of doek, na 15 minuten het overschot wegnemen, 24 uur laten drogen en een tweede dunne laag aanbrengen.',
      'Blanke lak: twee tot drie lagen met tussenschuren (korrel 240).',
    ],
  });
  P.push({
    title: 'Monteren en plaatsen',
    when: 'Als de afwerking droog is',
    items: [
      `Volg de stappen in deze handleiding; reken op ongeveer ${Math.ceil(A.h.total)} uur werk, verdeeld over ${A.h.total > 7 ? 'twee dagen' : 'één dag'}.`,
      'Werk op een vlakke, schone ondergrond met een oude deken of karton om krassen te voorkomen.',
      ...(A.J === 'deuvel' ? ['Lijm niet te veel: een dun laagje in het gat is genoeg. Veeg uitgeperste lijm direct weg met een vochtige doek.'] : []),
      ...(A.seams ? ['Bovenblad en bodem bestaan uit meerdere delen; leg ze eerst droog tegen elkaar en controleer of de naad vlak en gesloten is.'] : []),
      ...(A.tall ? ['Een hoge kast altijd aan de muur verankeren met een kiepbeveiliging.'] : []),
      'Zet de kast waterpas met viltjes of stelpootjes en stel daarna pas de deuren en lades af.',
    ],
  });
  return P;
}

// ---------- planning ----------
export function planning(d, geo, A) {
  const wait = A.mode === 'cnc' ? 10 : A.mode === 'zagen' ? 5 : 0; // werkdagen levertijd
  const bars = [];
  let day = 0;
  const add = (name, start, len, kind = 'werk', h = null) => { bars.push({ name, start, len, kind, h }); return start + len; };
  add('Bestanden aanleveren, offerte', 0, 1, 'werk', 1);
  if (wait) {
    add(`Levertijd ${SERVICES[A.mode].label.toLowerCase()}`, 1, wait, 'wacht');
    add('Beslag en verf bestellen', 1, 3, 'wacht');
    day = 1 + wait;
  } else day = 1;
  day = add('Ontvangen en controleren', day, 1, 'werk', 0.5);
  const selfWork = (A.mode === 'zelf' ? 3 : 0) + (A.mode !== 'cnc' ? 2 : 0) + (A.bevels.length ? 1 : 0);
  if (selfWork) day = add('Zelf zagen, boren, schuine kanten', day, Math.max(1, Math.round(selfWork / 3)), 'werk', selfWork);
  const finishFirst = A.paint || A.J !== 'deuvel';
  if (A.paint) {
    day = add('Schuren, grondverf', day, 1, 'werk', 2.5);
    day = add('Tussenschuren, lak laag 1', day, 1, 'werk', 2);
    day = add('Lak laag 2', day, 1, 'werk', 1.5);
    day = add('Uitharden', day, 2, 'wacht');
  } else if (finishFirst) {
    day = add('Schuren, olie of lak', day, 2, 'werk', 3);
  } else {
    day = add('Schuren, kanten breken', day, 1, 'werk', 2);
  }
  const asm = A.h.total;
  const asmDays = asm > 7 ? 2 : 1;
  day = add('Korpus monteren', day, asmDays === 2 ? 1 : 0.6, 'werk', asm * 0.6);
  day = add('Lades, deuren, grepen, afstellen', day, asmDays === 2 ? 1 : 0.4, 'werk', asm * 0.4);
  if (!finishFirst) day = add('Olie of lak na montage (2 lagen)', day, 2, 'werk', 2.5);
  add('Plaatsen, waterpas, verankeren', day, 0.5, 'werk', 0.5);
  const total = Math.ceil(Math.max(...bars.map(b => b.start + b.len)));
  const hoursTotal = bars.reduce((a, b) => a + (b.h || 0), 0);
  return { bars, total, hoursTotal };
}

// ---------- begrippen ----------
export function glossary(A) {
  const G = [
    ['Korpus', 'De kast zelf zonder fronten: zijwanden, bodem, bovenblad, schotten en achterwand.'],
    ['Front', 'De zichtbare voorkant: deur, klep of ladefront.'],
    ['Opdek (vol / half)', 'Hoeveel een deur over het korpus valt. Vol opdek bedekt de hele zijwand, half opdek de helft (bij een tussenschot met twee deuren).'],
    ['Plint / sokkel', 'De terugliggende strook onder de kast, die de bodem van de vloer tilt.'],
    ['Tussenschot', 'Verticale plaat die de kast in kolommen verdeelt.'],
    ['Legplank vast / verstelbaar', 'Een vaste plank is verbonden met de wanden; een verstelbare ligt op planksteuntjes in een gaatjesrij.'],
    ['Gaatjesrij', 'Rij gaatjes van Ø5 mm, 32 mm uit elkaar, voor planksteuntjes.'],
    ['Achterwand', 'Dunne plaat achterop die de kast haaks en stijf houdt.'],
    ['Potscharnier', 'Verborgen scharnier in een rond gat (pot) van Ø35 mm in de deur. Instelbaar in drie richtingen.'],
    ['Montageplaat', 'Plaatje in de kast waarop het scharnier klikt.'],
    ['Ladegeleider', 'Metalen rail onder of naast de lade. Volledig uittrekbaar betekent dat de hele lade uit de kast kan.'],
    ['Push-to-open', 'Openen door op het front te drukken, zonder greep.'],
    ['Deuvel', 'Houten pen (Ø8 × 35 mm) die met lijm twee platen verbindt.'],
    ['Confirmat', 'Speciale meubelschroef (7 × 50 mm) voor plaatmateriaal; de kop is zichtbaar en wordt met een dopje afgedekt.'],
    ['Cabineo / Clamex', 'Verbinders van Lamello. De kast is na montage weer uit elkaar te halen. Cabineo: onzichtbare schroefverbinding. Clamex: verbinder voor naden.'],
    ['Naad', 'Plek waar een lang blad uit twee delen bestaat omdat het niet op één plaat past.'],
    ['Verstek', 'Twee delen onder een hoek die beide schuin gezaagd zijn, zodat de hoek gesloten is.'],
    ['Afschuining / zaaghoek', 'Een kopse kant die niet haaks maar onder een hoek gezaagd wordt. De hoek staat in de zaaglijst.'],
    ['Zijde A / B', 'De twee vlakken van een plaat. Zijde A is de zijde zoals getekend in de DXF; B is de achterzijde.'],
    ['Kopse kant', 'De smalle zijkant van een plaat (de dikte).'],
    ['Nerf', 'De richting van de houtvezels. In de zaaglijst staat de lengte altijd langs de nerf.'],
    ['Kantenband', 'Strook fineer of kunststof die op een kopse kant gelijmd wordt.'],
    ['Zaagsnede', 'Het materiaal dat het zaagblad wegneemt (meestal 3 tot 4 mm).'],
    ['Zaagplan / nesting', 'Indeling van alle onderdelen op de platen, zodat er zo weinig mogelijk verloren gaat.'],
    ['DXF', 'Tekenbestand dat zaagbedrijven en CNC-machines kunnen lezen. Lagen bepalen wat er gezaagd, gefreesd of geboord wordt.'],
    ['CNC', 'Computergestuurde freesmachine die platen exact uitfreest en boort.'],
    ['Multiplex', 'Plaat van verlijmde houtlagen; sterk, en de laagjes zijn zichtbaar op de kopse kant.'],
    ['MDF', 'Vezelplaat; heel vlak en goed te verven, maar de kanten zuigen en moeten worden afgedicht.'],
    ['Fineer', 'Dun laagje echt hout op een plaat.'],
    ['Kanten breken', 'De scherpe rand licht afronden met schuurpapier of een frees, zodat hij niet splintert.'],
    ['Tussenschuren', 'Licht schuren tussen twee verf- of laklagen voor een glad resultaat.'],
    ['Grondverf / primer', 'Eerste verflaag die hecht en de ondergrond afdicht.'],
    ['Hardwax-olie', 'Olie met was die in het hout trekt; natuurlijke uitstraling en plaatselijk te herstellen.'],
    ['Haaks / diagonaal meten', 'De kast is haaks als beide diagonalen even lang zijn.'],
    ['Voeg', 'De smalle spleet tussen fronten (3 mm).'],
  ];
  return G;
}

// ---------- tekenen ----------
export function drawPrep(doc, ctx, d, geo) {
  const A = analyse(d, geo);
  const phases = prepPhases(d, geo, A);
  const { page, foot, heading } = ctx;

  // overzicht van de aanpak + stappen, met doorloop over pagina's
  page(); heading(doc, 'Voorbereiding');
  let y = 26;
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  const svcLbl = SERVICES[A.mode].label;
  const fin = A.paint ? 'gelakt, vóór de montage' : A.J === 'deuvel' ? 'olie of lak, na de montage' : 'olie of lak, vóór de montage';
  const summary = `Aanpak voor dit ontwerp:  ${svcLbl}  ·  ${JOINERY[A.J].label}  ·  afwerking ${fin}${A.bevels.length ? `  ·  ${A.bevels.length} schuine kanten` : ''}${A.seams ? `  ·  ${A.seams} naad` : ''}`;
  doc.text(clean(summary), M, y); y += 7;
  const colW = (PW - 2 * M - 10) / 2;
  let col = 0, x = M, yStart = y;
  const newCol = () => {
    if (col === 0) { col = 1; x = M + colW + 10; y = yStart; }
    else { foot(); page(); heading(doc, 'Voorbereiding (vervolg)'); col = 0; x = M; y = yStart = 26; }
  };
  phases.forEach((ph, i) => {
    // hoogte inschatten
    doc.setFontSize(8.6);
    const lines = ph.items.map(t => doc.splitTextToSize(clean(t), colW - 7));
    const need = 11 + lines.reduce((a, l) => a + l.length * 3.6 + 1.2, 0);
    if (y + need > PH - 14) newCol();
    // nummer en titel
    doc.setFillColor(...ACC); doc.circle(x + 3, y + 1.6, 3, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), x + 3, y + 2.7, { align: 'center' });
    doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(clean(ph.title), x + 8, y + 2.8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...ACC);
    doc.text(clean(ph.when).toUpperCase(), x + 8, y + 7);
    y += 10.5;
    doc.setFontSize(8.6); doc.setTextColor(...INK);
    lines.forEach(l => {
      doc.setFillColor(...MUTED); doc.circle(x + 9.3, y - 1, 0.55, 'F');
      doc.text(l, x + 12, y); y += l.length * 3.6 + 1.2;
    });
    y += 4;
  });
  foot();

  // planning
  const plan = planning(d, geo, A);
  page(); heading(doc, 'Planning');
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text(clean(`Ongeveer ${plan.total} werkdagen doorlooptijd, waarvan ± ${Math.round(plan.hoursTotal)} uur eigen werk. Indicatief; wachttijden hangen af van de zaagservice en de droogtijd van de verf.`), M, 26);
  gantt(doc, plan, M, 34, PW - 2 * M, PH - 34 - 22);
  foot();
  return A;
}

function gantt(doc, plan, x, y, w, h) {
  const labelW = 70, hrsW = 16;
  const gx = x + labelW, gw = w - labelW - hrsW;
  const days = plan.total;
  const dw = gw / days;
  const rowH = Math.min(9, (h - 10) / plan.bars.length);
  // daglijnen
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  for (let i = 0; i <= days; i++) {
    const xx = gx + i * dw;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.15); doc.line(xx, y, xx, y + 6 + plan.bars.length * rowH);
    if (i < days && (days <= 20 || i % 2 === 0)) doc.text(String(i + 1), xx + dw / 2, y + 3.5, { align: 'center' });
  }
  doc.text('DAG', gx - 2, y + 3.5, { align: 'right' });
  doc.text('UREN', x + w, y + 3.5, { align: 'right' });
  plan.bars.forEach((b, i) => {
    const yy = y + 6 + i * rowH;
    doc.setFontSize(8.3); doc.setTextColor(...INK);
    doc.text(clean(b.name), x, yy + rowH * 0.62);
    const bx = gx + b.start * dw, bw = Math.max(1.5, b.len * dw);
    if (b.kind === 'wacht') { doc.setFillColor(...PALE); doc.setDrawColor(...ACC); doc.setLineDashPattern([0.8, 0.6], 0); doc.rect(bx, yy + 1.5, bw, rowH - 3, 'FD'); doc.setLineDashPattern([], 0); }
    else { doc.setFillColor(...ACC); doc.rect(bx, yy + 1.5, bw, rowH - 3, 'F'); }
    if (b.h) { doc.setTextColor(...MUTED); doc.text(b.h.toFixed(1), x + w, yy + rowH * 0.62, { align: 'right' }); }
  });
  const ly = y + 10 + plan.bars.length * rowH;
  doc.setFillColor(...ACC); doc.rect(x, ly, 6, 3, 'F'); doc.setFontSize(7.5); doc.setTextColor(...INK); doc.text('eigen werk', x + 8, ly + 2.5);
  doc.setFillColor(...PALE); doc.setDrawColor(...ACC); doc.setLineDashPattern([0.8, 0.6], 0); doc.rect(x + 32, ly, 6, 3, 'FD'); doc.setLineDashPattern([], 0);
  doc.text('wachten / drogen / levertijd', x + 40, ly + 2.5);
}

export function drawGlossary(doc, ctx, A) {
  const { page, foot, heading } = ctx;
  const G = glossary(A);
  page(); heading(doc, 'Begrippenlijst');
  const cols = 3, gap = 8, cw = (PW - 2 * M - gap * (cols - 1)) / cols;
  let c = 0, y = 26;
  for (const [term, def] of G) {
    doc.setFontSize(7.8);
    const l = doc.splitTextToSize(clean(def), cw);
    const need = 4 + l.length * 3.3 + 2.6;
    if (y + need > PH - 12) { c++; y = 26; if (c >= cols) { foot(); page(); heading(doc, 'Begrippenlijst (vervolg)'); c = 0; } }
    const x = M + c * (cw + gap);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...INK); doc.text(clean(term), x, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(70, 68, 64); doc.text(l, x, y + 3.8);
    y += need;
  }
  foot();
}
