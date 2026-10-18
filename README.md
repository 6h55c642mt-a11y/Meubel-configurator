# Meubel-configurator

Ontwerp een kast op maat in de browser en krijg alles wat je nodig hebt om hem zelf te bouwen: 3D-weergave, maattekening, beslaglijst, zaaglijst en DXF-zaagbestanden.

**Live:** https://6h55c642mt-a11y.github.io/Meubel-configurator/

## Stappen
1. **Project & afmetingen** – naam, breedte/hoogte/diepte in mm, plaatdikte, achterwand, ladebakdikte
2. **Materiaal & kleur** – berken/populier multiplex, eiken/noten fineer, gelakt multiplex of MDF met Scandinavisch palet + kleurkiezer; korpus en fronten apart
3. **Sokkel** – hoogte en terugsprong
4. **Kolommen & vakken** – aantallen, breedtes; planken en schotten slepen in 3D of maten typen in de labels; planken vast (deuvels) of verstelbaar (gaatjesrij)
5. **Fronten & interieur** – deur links/rechts, dubbele deur, klep omhoog/omlaag, lade; fronten over meerdere vakken; open vak, garderobestang, binnenlades
6. **Grepen** – push-to-open, staafgreep, greeplijst, kantgreep, platte greep, knop; afwerking chroom, RVS, mat zwart, mat wit, messing, antraciet
7. **Overzicht & export** – PDF, DXF, projectbestand (JSON), deellink, opgeslagen ontwerpen

Weergave: 3D/2D (orthografisch vooraanzicht), Render/Shaded/Lijnen, fronten dicht/open/weg, maten aan/uit.

## Constructie (aannames)
- Stompe verbindingen met deuvels Ø8×35, plaatdikte instelbaar (standaard 18 mm)
- Bovenblad doorlopend over de zijwanden; bodem en tussenschotten tussen de zijwanden
- Zijwanden tot de vloer, plint ertussen (voor + achter)
- Opgelegde achterwand, geschroefd
- Opliggende fronten met 3 mm voeg; potscharnieren Ø35 (vol/half opdek wordt automatisch bepaald)
- Ladebakken met volledig uittrekbare geleiders (13 mm per zijde), lengte afgestemd op de diepte
- Delen langer dan de plaat (bovenblad, bodem, achterwand, plint) worden automatisch gesplitst op het hart van een tussenschot

## DXF-lagen
| Laag | Inhoud |
|---|---|
| `PLAAT` | omtrek ruwe plaat |
| `SNIJ` | contour van elk onderdeel (gesloten polyline) |
| `BOOR_A_D8` / `BOOR_B_D8` | deuvelgaten Ø8, zijde A = zoals getekend, B = achterzijde |
| `BOOR_A_D5` / `BOOR_B_D5` | gaatjesrij planksteunen Ø5 |
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
js/main.js      stappen-UI
```

Lokaal draaien: `python3 -m http.server` in deze map en open http://localhost:8000.

## Nog te doen
- Schuine zijden (vrije polygoon in aanzicht)
- Ontwerpen synchroniseren met GitHub
