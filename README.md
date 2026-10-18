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
7. **Overzicht & export** – PDF-overzicht, DXF-zaagbestand, montagehandleiding (PDF), 3D-model voor Rhino (.3dm), projectbestand (JSON), deellink; nerf per materiaal aan/uit voor zuiniger nesten

Weergave: 3D/2D (orthografisch vooraanzicht), Render/Shaded/Lijnen, fronten dicht/open/weg, maten aan/uit.

## Constructie (aannames)
- Stompe verbindingen met deuvels Ø8×35, plaatdikte instelbaar (standaard 18 mm)
- Bovenblad doorlopend over de zijwanden; bodem en tussenschotten tussen de zijwanden
- Zijwanden tot de vloer, plint ertussen (voor + achter)
- Opgelegde achterwand, geschroefd
- Opliggende fronten met 3 mm voeg; potscharnieren Ø35 (vol/half opdek wordt automatisch bepaald)
- Ladebakken met volledig uittrekbare geleiders (13 mm per zijde), lengte afgestemd op de diepte
- Kasten breder dan de plaat worden automatisch in **modules** verdeeld (eigen zijwanden, gekoppeld met kastverbinders), zodat elk deuvelgat in massief plaatmateriaal landt
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
js/export3dm.js Rhino .3dm-export
js/main.js      stappen-UI
```

Lokaal draaien: `python3 -m http.server` in deze map en open http://localhost:8000.

## 3DM (Rhino)
Elk plaatdeel is een gesloten extrusie (solid) met naam `NN Onderdeel`, laag per groep (Korpus, Plint, Achterwand, Fronten, Lades, Beslag) en user text: Nummer, Onderdeel, Materiaal, Lengte_mm, Breedte_mm, Dikte_mm, Opmerking. Grepen en garderobestangen als mesh. Eenheden: mm.

## Nog te doen
- Ontwerpen synchroniseren met GitHub
