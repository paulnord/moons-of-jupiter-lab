# Moons of Jupiter Lab

A modern, independent educational reconstruction of Project CLEA's *The Revolution of the Moons of Jupiter*. Observe the Galilean moons, measure their east–west displacement, estimate and fit orbital curves, and use Kepler's third law to infer Jupiter's mass. Intended for educational, noncommercial use.

The working app is in `dist/`. It needs an ordinary static web host, no build step, and no student-data backend. No external scripts or fonts are fetched at runtime.

## Run locally

Serve the repository’s `dist/` folder over HTTP:

```sh
python3 -m http.server 8873 --directory dist
```

Open `http://localhost:8873`. JavaScript modules and local catalog tiles require HTTP serving; opening `index.html` directly as a file is not supported. Node is needed only for the optional checks, not to run the lab.

## Publishing

The GitHub Pages workflow in `.github/workflows/pages.yml` publishes `dist/` on pushes to `main`, after the astronomy, observing-workflow, catalog and report checks pass under Node 24. In the repository’s **Settings → Pages**, select **GitHub Actions** as the source.

The public repository is [paulnord/moons-of-jupiter-lab](https://github.com/paulnord/moons-of-jupiter-lab), with the [live lab on GitHub Pages](https://paulnord.github.io/moons-of-jupiter-lab/). The existing [Sites version](https://moons-of-jupiter.paranord.chatgpt.site) is managed separately. The GitHub export does not need the Sites hosting manifest.

## Use

1. Choose space or ground-based viewing, a UTC start time and observing interval. New sessions begin at the January 2024 Hubble image epoch. Clouds apply only to ground mode.
2. Hover to identify moons or catalog stars (Tycho ID and V_T magnitude). Click a moon’s center to record immediately. Reclick to replace that moon’s measurement at the same observing time. An ambiguous click offers each nearby moon or Both; the observer decides whether to use the overlap. Keyboard target selection is also available.
3. Use the left/right arrow keys or the controls beside the telescope date to advance observations. Undo recording reverses the last click or replacement. Collect enough points to resolve each orbit. Missing observations remain gaps.
4. Estimate amplitude, period, and an eastward zero crossing. Plot your curve, adjust it, inspect residuals, and optionally refine near your estimated period. Graph limits follow the recorded data: changing the fit moves the curve while axes and measured points stay fixed. Oversized curves are clipped at the graph edges, including in reports.
5. Compare the four mass estimates and record your explanation.
6. **Save session** downloads a JSON file; **Open session** restores it. Save before closing. Export one CSV for Data Tool: elapsed time is the first column (X); the next four columns hold Io, Europa, Ganymede and Callisto positions (Y), in Jupiter diameters with east positive. One row per observed epoch; missing positions are blank. UTC, Julian date, inclusion flags, notes and overlap assignments follow as metadata. In Data Tool use **Data → Load file**, choose the desired moon as Y, and review exclusions and fit intervals (CSV does not apply them automatically). **Save PNG** and **Print report** prompt for lab group members and offer a four-panel figure (default) or the selected moon. Figures include the report timestamp with timezone, observation epoch, saved periods, amplitudes, zero crossings, inferred masses, RMS and fit inclusion counts. PNG output is 4800 pixels wide (four times the figure size). Printing sends vector curves and text to the printer and includes only the figure with its analysis, without measurement tables. Figures show the full recorded interval, with a common time axis for the four-moon view.

Instructor settings control identification, distance readout, clouds, backward/restart access, custom instructions, and an optional classroom PIN. To distribute a configuration, save an empty configured session. The PIN is a casual classroom convenience, not an exam-security system.

## Telescope graphics

Nine real Hubble OPAL frames supply Jupiter’s rotating appearance. Moons use physical radii and approximate reflectance; subpixel coverage is retained before a shared optical blur. The physical transit silhouette covers the underlying clouds; far-side moons are covered by the opaque Jupiter disk. Approximate computed shadows are separate from the moons. Ground-based mode applies adjustable blur to the entire optical scene. Moon names appear on hover, not as permanent telescope labels; colored symbols remain in the overhead diagram. Exact clicked detector coordinates still determine measurements. Each measured moon keeps its open-center position marker while you mark other moons. Reclicking moves that moon’s marker; moving to another observation clears the markers. Brightness changes and magnification preserve them. Undo restores the previous marker along with the measurement. The aiming cursor uses an open-circle reticle. Manual assignment and distance entry remain available when instructor settings hide assistance.

The initial date is 2024-01-05 20:46 UTC. The nearest photographic aspect repeats every 9.925 hours; this is a sampled visual approximation, not a precise longitude or changing-weather model. Existing session files still load, defaulting to ground mode when no mode is stored. Mode, seeing, brightness and contrast are saved in new session files. Brightness and contrast stretch a cached Float32 linear-intensity image. They do not alter observations or create fresh exposure-dependent blooming. A fixed scattered-light halo is part of the capture. The source planet texture is processed 8-bit Hubble imagery; the optical synthesis adds higher-precision sampling, moon intensities, stars, blur and glare. It is not raw Hubble CCD data or calibrated detector photometry.

## Background stars

The app loads 133,269 real stars from the Tycho-2 main catalogue plus Supplement-1 in local 30-degree RA tiles (4.8 MB total; loaded on demand). The subset covers ±5 degrees of J2000 ecliptic latitude, through V_T magnitude 12. Source queries, hashes, record layout, counts and references are in `dist/assets/stars/sources.json`; `scripts/build-star-catalog.py` reproduces the subset. The app uses the date-dependent Jupiter position and angular diameter, and propagates stars with catalog proper motions. Stars without motion data retain their original coordinates. There are no synthetic stars. This is not a complete faint sky; annual stellar parallax, binary orbital motion and variability are omitted.

## Verification

The wide CSV was checked against Data Tool 2027’s actual delimiter parser and column-mapping functions (`dataInput.ts`, SHA `ba93f776152d623b08ccce9cc94ad7cca8f6b086`), including header/X detection, all four Y columns, blank positions, numeric negatives, overlap flags and quoted multiline notes.

`npm install` installs the optional DOM-test dependency. `npm test` runs the scientific and simulated UI checks. For an existing jsdom installation, the UI check accepts its module path in `JUPITER_JSDOM_MODULE`.

- Scientific checks compare periods and radii to NASA/JPL reference values, verify mass recovery, and check serialization, malformed data rejection, CSV escaping, and repeatable clouds.
- UI checks exercise a complete 42-epoch, four-moon observing sequence, manual/refined fits, exclusions and edits, save/open round trips, exports, clouds, instructor restrictions, PIN entry, and simulated browser-tool registration.
- Click-and-fit checks use the canvas click handlers for 71 epochs over 35 days, with up to 0.8 detector pixel aiming error. All four moons are fitted using recorded positions and initial periods estimated from their zero crossings. A regression verifies that a low initial amplitude does not restrict the coarse slider; fine adjustment can be switched off to restore its full 0.001–30 Jupiter-diameter range.
- Optional `scripts/check-graphics.mjs` uses a native Canvas implementation (`JUPITER_CANVAS_MODULE`) to check original-image hashes, date-to-frame selection, session mode migration, and actual rendered occultations, eclipses, transits, shadows and seeing. Set `JUPITER_QA_DIR` to write a rendering contact sheet.
- Observing-workflow checks verify one-click recording, same-moon replacement, atomic Undo for Both, independent overlap records, keyboard focus/instructor restrictions, and display-setting round trips. Image checks verify that brightness leaves the Float32 capture unchanged, reveals existing glare, can clip Jupiter on screen, and resets pixel-for-pixel.
- Catalog checks validate source-file hashes, ecliptic bounds, magnitude limits, proper-motion scale, date-dependent field drift and on-demand tiles against the complete bundled subset across 1600–2200.
- Report checks cover four/single panels, actual saved fit values and calculated masses, inclusion/range rules, names, timestamps, empty fits, escaped input, and optional native PNG rendering. The DOM workflow checks report preparation, PNG download type and printing.
- These checks do not establish rendered cross-browser appearance, actual printer/download behavior, or agreement with the running original Windows program. Those remain review tasks.

Read [REBUILD_SPEC.md](REBUILD_SPEC.md) for scientific conventions, learning checkpoints, feature mapping, limitations, and acceptance evidence.

## Attribution

Project CLEA, Gettysburg College, NSF, and NASA are credited for the original activity and documentation. This app does not reproduce the original executable or its assets. The bundled `dist/vendor/astronomy.mjs` is the unmodified ESM source from **astronomy-engine 2.1.19**, by Don Cross, under its embedded MIT license.

- [CLEA student manual](https://public.gettysburg.edu/~marschal/clea/clea_products/manuals/Jupit_sm.pdf)
- [CLEA technical guide](https://public.gettysburg.edu/~marschal/clea/clea_products/manuals/Jupit_ug.pdf)
- [Astronomy Engine](https://github.com/cosinekitty/astronomy)
- [JPL satellite mean elements](https://ssd.jpl.nasa.gov/sats/elem/)
- [NASA Jovian satellite fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html)
- [JPL planetary physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html)

Jupiter photography: NASA, ESA, Amy Simon (NASA-GSFC); Image Processing: Joseph DePasquale (STScI). The [NASA source](https://science.nasa.gov/asset/hubble/jupiter-opal-2024/) and corresponding [ESA/Hubble release](https://esahubble.org/images/heic2404d/) are credited visibly in the app, with [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and the [reuse policy](https://esahubble.org/copyright/). Original PNGs and per-image URLs, timestamps and hashes are in `dist/assets/jupiter/`. Views 04–06 are excluded to avoid photographed Io/shadow features. Runtime adaptations: aligned disk clipping, scaling, optical blur, simulated moons and shadows.

The previous graphics version is preserved at `previous/` for comparison (source baseline `97994f5`), sharing unchanged Jupiter images and Astronomy Engine assets.
