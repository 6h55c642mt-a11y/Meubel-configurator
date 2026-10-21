# Meubel-configurator

Ontwerp een kast op maat in de browser en krijg alles wat je nodig hebt om hem zelf te bouwen: 3D-weergave, maattekening, beslaglijst, zaaglijst en DXF-zaagbestanden.

**Live:** https://6h55c642mt-a11y.github.io/Meubel-configurator/

## Stappen
1. **Project & afmetingen** – naam, breedte/hoogte/diepte in mm, plaatdikte, achterwand, ladebakdikte, **vorm bovenrand** (rechthoek, schuin, knieschot, puntdak of vrije punten slepen/typen)
2. **Materiaal & kleur** – berken/populier multiplex, eiken/noten fineer, gelakt multiplex of MDF met Scandinavisch palet + kleurkiezer; korpus en fronten apart
3. **Sokkel** – hoogte en terugsprong
4. **Kolommen & vakken** – aantallen, breedtes; planken en schotten slepen in 3D of maten typen in de labels; planken vast (deuvels) of verstelbaar (gaatjesrij)
5. **Fronten & interieur** – deur links/rechts, dubbele deur, klep omhoog/omlaag, lade; fronten over meerdere vakken; open vak, garderobestang, binnenlades
6. **Grepen** – push-to-open, staafgreep, greeplijst, kantgreep, platte greep, knop; afwerking chroom, RVS, mat zwart, mat wit, messing, antraciet
7. **Overzicht & export** – kostenraming (plaat, beslag, zaag-/CNC-service, instelbare richtprijzen) en montage-uren; PDF-overzicht, DXF-zaagbestand, montagehandleiding (PDF), 3D-model voor Rhino (.3dm), projectbestand (JSON), deellink; nerf per materiaal aan/uit voor zuiniger nesten

Weergave: 3D/2D (orthografisch vooraanzicht), Render/Shaded/Lijnen, fronten dicht/open/weg, maten aan/uit.

## Constructie (aannames)
- Stompe verbindingen met deuvels Ø8×35, plaatdikte instelbaar (standaard 18 mm)
- Bovenblad doorlopend over de zijwanden; bodem en tussenschotten tussen de zijwanden
- Zijwanden tot de vloer, plint ertussen (voor + achter)
- Opgelegde achterwand, geschroefd
- Opliggende fronten met 3 mm voeg; potscharnieren Ø35 (vol/half opdek wordt automatisch bepaald)
- Ladebakken met volledig uittrekbare geleiders (13 mm per zijde), lengte afgestemd op de diepte
- Verbindingssysteem per ontwerp: **deuvels**, **Confirmat** of **Lamello Cabineo** (alle bewerkingen in het vlak, CNC-vriendelijk)
- Kasten breder dan de plaat: bovenblad, bodem en plint krijgen een **naad op het hart van een tussenschot** (elk deel 9 mm oplegging), gekoppeld met Clamex of werkbladverbinders; het schot op de naad zit met hoekverbinders vast — geen dubbele schotten
- Een eindpunt van de bovenrand op y = 0 laat de schuine kant tot op de vloer doorlopen: geen zijwand, bodem/plint/planken stoppen met een schuine kop tegen de schuine plaat (hoekverbinders), de voet van het blad wordt horizontaal afgezaagd
- Bovenbladnaden worden los van de bodemnaden bepaald, gemeten langs de helling
- Schuine bladen met een helling > 10° worden met hoekverbinders bevestigd (haaks boren zou de kopse kant van de wand uitlopen)
- Gaten aan weerszijden van een schot op dezelfde hoogte worden versprongen geboord
- Hoge achterwanden worden gesplitst op het hart van een tussenschot (geschroefd)
- Schuine bovenrand: schuine bladen met verstek, zijwanden en schotten met afgeschuinde bovenkant, planken eindigen onder de schuine rand, fronten en achterwand krijgen de echte contour

## DXF-lagen
| Laag | Inhoud |
|---|---|
| `PLAAT` | omtrek ruwe plaat |
| `SNIJ` | contour van elk onderdeel (gesloten polyline) |
| `BOOR_A_D8` / `BOOR_B_D8` | deuvelgaten Ø8, zijde A = zoals getekend, B = achterzijde |
| `BOOR_A_D5` / `BOOR_B_D5` | gaatjesrij planksteunen Ø5 |
| `BOOR_A_D6` / `BOOR_B_D6` | deuvels Ø6 ladebakken |
| `POT_B_D35` | scharnierpotten Ø35 (binnenzijde front) |
| `BOOR_x_D7_DOOR` | Confirmat-doorboring Ø7 |
| `CAB_PILOT_x_D5` / `CABINEO_x` | Cabineo: voorboring in het ontvangende vlak / plaats van de freeszak (marker Ø12 — vervang door het Lamello-freesblok uit hun CAD-data) |
| `AFSCHUINING` | kopse kant die schuin gezaagd moet worden, met hoek en lange zijde |
| `TEKST` | onderdeelnummer, naam, maten, nerfrichting |

Nesting met MaxRects; materialen met nerf worden niet gedraaid. Eenheden: mm. Gaten in de kopse kanten staan niet in de DXF (zie tegenstuk).

## Techniek
Statische site zonder build-stap: ES-modules, [three.js](https://threejs.org) en [jsPDF](https://github.com/parallax/jsPDF) via CDN. Ontwerpen worden in `localStorage` bewaard.

```
js/model.js     datamodel en bewerkingen
js/geometry.js  ontwerp → plaatdelen, fronten, grepen, beslag, boorgaten
js/viewer.js    three.js-weergave, selecteren en slepen
js/nesting.js   plaatoptimalisatie
js/dxf.js       DXF R12-export
js/pdf.js       PDF-overzicht
js/manual.js    montagehandleiding
js/prep.js      voorbereiding, planning en begrippenlijst in de handleiding
js/costs.js     kostenraming en urenschatting
js/detail.js    beslag en uitsparingen voor het gedetailleerde model
js/csg.js       platen met uitsparingen (CSG)
js/export3dm.js Rhino .3dm-export
js/main.js      stappen-UI
```

Lokaal draaien: `python3 -m http.server` in deze map en open http://localhost:8000.

## 3DM (Rhino)
Rhino 7-formaat (opent ook in Rhino 8), Z omhoog: de kast staat op het XY-vlak, achterkant tegen Y=0, voorkant richting −Y (Front-view). Elk plaatdeel is een gesloten extrusie (solid) met naam `NN Onderdeel`, laag per groep (Korpus, Plint, Achterwand, Fronten, Lades, Beslag) en user text: Nummer, Onderdeel, Materiaal, Lengte_mm, Breedte_mm, Dikte_mm, Opmerking. Grepen en garderobestangen als mesh. Eenheden: mm.

**Gedetailleerd model** (schakelaar bij de export): extra lagen *Deuvels*, *Schroeven*, *Verbinders*, *Scharnieren* (kom, arm, montageplaat), *Ladegeleiders*, *Planksteunen* als solids; *Uitsparingen* (verborgen) met elk boorgat als cilinder-solid — `BooleanDifference` in Rhino trekt ze van de platen af; *Platen met uitsparingen* (verborgen) met de al doorgerekende platen als mesh (CSG in de browser met three-bvh-csg).

## Nog te doen
- Ontwerpen synchroniseren met GitHub
