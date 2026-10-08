# Reconstruction requirements and scientific intent

Version 1 — 2026-10-07. This specification describes the delivered implementation and the remaining validation work. It preserves learning goals independently of UI implementation. It does not claim exact CLEA binary parity.

## Audience and purpose

Students use repeated observations to infer orbital properties and a planet's mass. Instructors choose the level of observational assistance. IT staff need an accessible, portable replacement for legacy Windows software. The user's astronomy workbook has not yet been supplied; no assumptions about a particular instructor's use are prerequisites.

## Learning checkpoints

| Student action | Evidence to preserve | Why it matters |
| --- | --- | --- |
| Relate telescope motion to overhead orbits | Explore both views without recording overhead coordinates | Distinguish orbital motion from its projection |
| Identify moons and acquire observations | UTC/JD, assigned identity, signed displacement, note | Build an evidence-based observing record |
| Encounter clouds or hidden moons | Missing measurements and cloudy-epoch entries | Missing data are not zero displacement |
| Estimate a curve before refining | Explicit amplitude, period, positive-going zero crossing | Connect observable displacement to orbital scale and cycle count |
| Adjust and inspect residuals | Manual sliders, RMS, range and inclusion flags | Reason about fit quality and ambiguous sampling |
| Apply Kepler's law | Four independent mass estimates and an unweighted mean | Infer one physical property from multiple orbits |
| Explain differences | Free-form conclusions stored with measurements | Preserve the student's scientific argument |

Do not replace estimation with a button that supplies true orbital parameters. Local refinement may improve a student's estimate, but must not silently look up the moon's true period. The graph, notebook, and exported data all use recorded measurements, not a substituted theoretical series.

## Shared design rules

Match the companion spectra lab's light scientific workspace and navy application bar. Use system sans-serif type; monospaced numbers only where they improve reading. Main data controls stay close to their graph. Save/open and notebook conventions should be reused by future tools.

The telescope uses a black image field with real Jupiter photography and subtle moon spots. Jupiter's disk provides the physical scale. Names appear only on hover or selection; colored symbols are confined to the overhead diagram and can be hidden by the instructor. A large plot carries the analysis: blue recorded data, amber fitted curve. An expandable keyboard target list and labeled inputs accompany canvas interaction. No wheel handler may trap ordinary page scrolling.

## Feature correspondence

| Original documented capability | New implementation |
| --- | --- |
| Start date, observation interval, repeated viewing | UTC controls, previous/next, 0.05–168 hour interval |
| Variable magnification | Four telescope magnifications, 100×–400× |
| Measuring east/west positions | Cursor measurement or rounded virtual-pixel target selection |
| Color/identity assistance | Hover names in telescope view; symbols/colors in overhead view; instructor can hide identity |
| Hidden distance assistance | Detector pixels plus diameter ruler; student enters scaled distance |
| Cloudy observations | Ground mode only; deterministic per-epoch cloud state, configurable percentage, gap log |
| Animation and overhead view | Both available for exploration; measurement disabled in these modes |
| Manual sine fitting and RMS | Three parameters, coarse/fine slider ranges, residual panel |
| Fit refinement | Added local least-squares search around student's period |
| Editing observations | Edit identity/position/note, delete with confirmation, include/exclude |
| Time-range analysis | Per-moon fit range, plot zoom/pan independent of inclusion |
| Saving data and printing | Versioned JSON session, CSV measurements, PNG four/single-moon figure, print report |
| Instructor controls | Identification, distance, clouds, restart lock, custom instructions, optional PIN |
| Derived mass | Radius in AU, period in years, kg and Earth masses, unweighted mean |

Legacy CLEA file formats, Windows menus/shortcuts, the original bitmap, and exact old rounding are not reproduced. Exact behavior must still be compared against a running original installation before claiming parity.

## Scientific model and coordinates

Use the bundled Astronomy Engine 2.1.19 `JupiterMoons` EQJ jovicentric vectors in AU. Compute Earth's center-to-Jupiter vector using `BackdatePosition` with no aberration, then use the returned emission time for moon positions and Jupiter's pole. The light-travel correction is shared across the Jupiter system.

Let L be the normalized Earth-to-Jupiter vector and N the north-pole unit vector. Positive equatorial east is E = normalize(N × L); projected north is normalize(L × E). A moon's displayed horizontal coordinate is its vector dotted into E, converted to Jupiter diameters. East is positive and drawn to the left; the virtual detector's Jupiter center is x = 500. The equatorial-plane overhead coordinate uses normalize(N × E) and faces Earth downward.

Constants: Jupiter equatorial diameter 142984 km; AU 149597870.7 km; day 86400 s; Julian year 365.25 days; G 6.67430e-11 SI; Earth mass 5.9722e24 kg. Amplitude A is an orbital **radius expressed in planet diameters**: a = A × 142984 km. Compute M ≈ 4π²a³/(GP²) in consistent SI units. Neglect satellite mass. Never accidentally halve A because the unit is a diameter.

The sine model is x(t) = A sin(2π(t − t0)/P), with t in elapsed days from the session start. A > 0; 0.1 ≤ P ≤ 100 days. Refinement samples trial periods within ±15% of the initial P, solves sine/cosine least squares at each trial without a vertical offset, and narrows around the minimum over five passes. It needs at least five included data points spanning more than one observation time. It reports no formal parameter uncertainties. RMS is sqrt(mean(residual²)), not reduced chi-squared.

The viewing direction changes during an observing run; apparent fitted periods need not equal inertial sidereal periods. Eccentricity, projection, and perturbations also create departures from the simple sine model. Small residuals cannot rule out a wrong cycle count.

Visibility is approximate: far-side moon disks are covered by an opaque oblate Jupiter; a conical umbra removes eclipsed moon centers. Physical moon radii and approximate reflectance come from JPL/NASA. Transiting disks cover the clouds beneath them, while their shadows use parallel sunlight rays intersecting an oblate planet and a simple shrinking umbra radius. Partially occulted disks are clipped by the renderer; full occultation classification uses a conservative shrunken projected ellipse. No mutual satellite events, penumbrae, local horizon, daylight, noise or sky brightness. This is not a contact-time prediction model. Ground mode applies a common Gaussian blur, with seeing referenced to a nominal 40-arcsecond Jupiter. The allowed date range 1600–2200 is a UI guard, not a precision guarantee over that entire interval.

The telescope renderer uses nine original January 5–6, 2024 Hubble OPAL images. Excluded views 04–06 contain photographed Io or a shadow. Bounds of each planet image are calibrated independently; cropping and ellipse masking occur at runtime, preserving the original PNG bytes and hashes. The nearest rotational aspect is selected on a 9.925-hour cycle. Timestamp labels are treated as UTC only for approximate visual phase; no claim of absolute longitude calibration. Frame changes are discrete; Jupiter weather is a fixed 2024 reference. Moon positions remain independently computed for the selected date. Tiny moons use subpixel disk coverage before a shared optical point-spread function. The resulting RGB intensities are retained as Float32. The source planet texture remains processed photography; this does not recover raw Hubble dynamic range. Brightness is a display multiplier and contrast is a power-law stretch, with final sRGB output. A fixed illustrative scattered-light halo is present before those adjustments. Increasing brightness can wash out Jupiter and reveal its glare; reset is reversible. Photometry, noise, physical exposure, charge bleeding and detector saturation are not calibrated. New sessions start in fictional space-telescope mode at 2024-01-05 20:46 UTC. Old session files without a mode migrate to ground mode to preserve their cloud behavior.

## Measurement and persistence

The sensor has 1000 × 360 virtual pixels. Clicking records that cursor location; accessible selection rounds the projected center to a virtual pixel. Normal identified clicks record immediately. Reclicking the same moon/time upserts the existing record while preserving its ID, note and inclusion flag. Nearby/overlapping candidates open an inline chooser; each moon, Both, or All can be recorded. Both uses the same actual clicked pixel and displacement in separate per-moon records. No blend is automatically rejected or excluded. The notebook records overlap metadata, exported as per-moon CSV metadata columns. Undo reverses a single recording action atomically, including replacements and mixed create/replace Both actions. Editing/deleting/inclusion changes clear the short Undo history to avoid overwriting later notebook decisions. Undo is transient and not stored in session files. Manual assignment and measured distance entry remain available when instructor assistance is hidden. One record per assigned moon per observation time is used. Scale depends on magnification; physical data do not change when zooming.

Session state is in memory and must be explicitly saved as a downloaded JSON file. No cloud student database, hidden browser-only persistence, or autosave promise. `format: "jupiter-lab"`, `version: 1` identifies a session. It contains start/current UTC epoch milliseconds, interval hours, weather seed, student/group/notes, measurement IDs and inclusion flags, cloud log, per-moon fits and fit ranges, next ID, and instructor settings. File loading validates shape, finite values, date/size limits, moon IDs, fit bounds, and duplicate IDs before replacing current state. Open/new operations confirm unsaved-data replacement.

Telescope mode, seeing, brightness and contrast are saved. Transient plot zoom, magnification, overhead state, selected target, and residual toggles are not saved. Arrow navigation is active from the telescope/observing controls (or page body), never while typing, using a range/select control, manipulating the plot, or inside a modal. Backward navigation respects the instructor lock. Advancing time or changing scale cancels a pending overlap assignment. The position marker retains its original open-center ticks; only the aiming cursor gains a center circle. CSV uses one row per observed epoch: elapsed days, four moon position columns (Io, Europa, Ganymede, Callisto), UTC, JD, then per-moon inclusion flags, notes and overlap assignments. Missing positions are blank; excluded measurements remain in their position columns. Data Tool imports a common X and a chosen moon Y; CSV does not automatically restore fit exclusions or fit intervals. Quote every field; neutralize spreadsheet formula prefixes in text while retaining numeric negative positions. Do not render imported notes as HTML. The optional instructor PIN is a SHA-256 hash in the portable session; it is not a secure access boundary.

Read-only browser tooling may expose recorded session data, never unobserved theoretical answers. Advancing time must call the same action as the visible Next observation control. Browser tools are feature detected and optional; the lab works without them.

## Acceptance evidence and remaining review

`scripts/check-science.mjs` includes a 60-day, 6-hour sample beginning 2026-10-07. Independent NASA/JPL mean periods are approximately 1.769138, 3.551181, 7.154553, and 16.689017 days; orbital radii 421800, 671100, 1070400, and 1882700 km.

Fixed inertial projection recovers all sidereal periods within 0.01% in this test (acceptance threshold 0.1%). Earth-view fits recover apparent periods within 0.48% of those references, radii within 0.064%, and Jupiter mass within 1.11%. Earth-view acceptance bounds are 0.6% in period, 1.5% in radius and 4% in mass. These are specific smoke-test bounds, not universal accuracy guarantees or grading tolerances. The Callisto apparent-period difference was isolated using a fixed inertial projection rather than discarded as numerical noise.

The simulated DOM test exercises recorded, pixel-rounded observations and all primary controls, including numeric form validity after refinement. It checks round-trip data, hidden-assistance modes, missing observations, restrictions and basic tool registration. It does not render canvas or prove cross-browser behavior.

The amplitude slider uses the full numeric input range (0.001–30 Jupiter diameters) in coarse mode. Its former estimate-centered range could stop at 8 after an initial estimate of 5, preventing manual adjustment to Callisto's approximately 13.2-diameter amplitude. Fine adjustment intentionally narrows the range around the current fit; switching it off restores the full amplitude range. Period and phase controls retain their existing local adjustment behavior.

`scripts/check-click-fits.mjs` adds a canvas-click-handler regression and a 35-day observing sequence starting 2026-10-08 at 12-hour intervals. Deterministic aiming errors reach 0.8 detector pixel. The run records 65, 67, 69, and 69 measurements for Io, Europa, Ganymede, and Callisto, respectively. Fitting uses only these recorded positions, with initial periods estimated from positive-going zero crossings. Recovered amplitudes are 2.93415, 4.69294, 7.48630, and 13.16886 Jupiter diameters; apparent fitted periods are 1.76988, 3.55571, 7.17307, and 16.81223 days. All four inferred masses are within 1.6% of the reference value in this particular run (test acceptance: 3%). These are apparent Earth-view sine fits, not sidereal ephemerides. The test checks actual click coordinates, form validity, and leaving fine mode, but mocks canvas painting and is not a visual browser walkthrough.

The native Canvas check renders the actual `paintTelescope` code, verifies source-image hashes and rotational frame selection, compares pixel arrays with/without hidden and transiting moons and shadows, checks ground blur and mode/seeing serialization, and produces a contact sheet for visual inspection. This runs without a browser and does not establish DOM layout or browser-specific rendering.

Outstanding: rendered desktop/mobile/accessibility review; actual file download/open and print review in target browsers; complete comparison against the original Windows executable and the astronomy workbook when available; independent high-precision sky-position/visibility fixtures if that fidelity becomes a requirement. The original model is deliberately not represented as tested or equivalent.

## Catalog stars in the ecliptic band

Tycho-2 (Høg et al. 2000, A&A 355, L27; CDS/VizieR I/259), including Supplement-1, is filtered to |J2000 ecliptic latitude| ≤ 5 degrees and V_T ≤ 12. Local binary tiles span 30 degrees of RA and are loaded on demand. Source queries, hashes, counts and the 36-byte record format accompany the subset. Mean main-catalog coordinates have epoch J2000; Supplement-1 is J1991.25. Entries lacking mean motion use observed coordinates and their documented epoch. The runtime propagates each ICRS direction with the tangential proper-motion vector (pmRA includes cos(dec)), then projects into the same Jupiter east/north axes and date-dependent angular diameter as the moon model. Two degrees of RA padding covers proper-motion drift when selecting neighboring tiles. No annual parallax, radial velocity, stellar variability or binary orbital motion; no synthetic stars. Tycho-2 is not complete to the V_T=12 selection limit.

## Report figures

Save PNG and both Print report controls open the same report dialog. It prompts for lab group member names, keeps the existing optional group/table field, and defaults to all four moons in a two-by-two figure. The current-moon option creates one panel. Names remain in the backward-compatible session `student` string (newlines allowed).

Each report includes its actual generation timestamp in the browser’s local timezone (with zone name/offset), separately from the simulated observation epoch in UTC. It uses recorded measurements and saved student curve parameters only. Period, amplitude, zero crossing, inferred mass, RMS, fit-point counts and fit ranges accompany each panel; no-fit panels stay explicitly unfit. Exclusions and fit ranges are honored for RMS/counts, with open circles for other points. Four panels share the full recorded time interval; report figures are independent of interactive graph zoom/residual display. PNG is rasterized at four times the SVG figure dimensions (4800 pixels wide), with the SVG image decoded at the final output dimensions. Printing uses only the same vector figure, preserving text and paths, with stronger grid and curve strokes. No notebook tables are printed, and no forced page break is added. The direct browser print shortcut also refreshes the report.

Native Canvas rendering checks produce real PNG files for four-moon, single-moon, and unfit reports. DOM checks cover the report dialog, member names, scope selection, PNG download MIME type, and print preparation. Native printer pagination and browser download dialogs remain unverified in the managed static environment.
