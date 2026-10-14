---
name: cad-studio
description: Authoritative guide for generating professional mechanical, automotive, architectural, and industrial CAD designs using OpenSCAD WASM with built-in gears, threads, fasteners and bearings libraries. Produces ISO-standard assemblies including car gearboxes, engine blocks, reducers, structural frameworks, and precision mechanisms rendered with PBR materials in the RUN01 CAD Studio.
argument-hint: "[mechanical-assembly-description] [parameters]"
metadata:
  author: run01
  version: "3.0.0"
---

# AI Parametric CAD Studio Skill — Mechanical Engineering Edition

This skill instructs the AI on generating professional-grade, mechanically accurate OpenSCAD 3D models and assemblies in RUN01. The in-browser CAD Studio compiles OpenSCAD via WebAssembly (Manifold engine), renders with PBR Three.js (studio lighting, shadows), and exports STL/OBJ/JSON.

---

## 1. Built-in Mechanical Libraries (Always Available in WASM FS)

The following libraries are pre-loaded into every OpenSCAD WASM instance. **Always use them — never re-implement their functionality from scratch.**

```openscad
include </lib/gears.scad>;      // gear(), helical_gear(), rack(), bevel_gear()
include </lib/threads.scad>;    // metric_thread(), metric_thread_hole(), metric_thread_pitch()
include </lib/fasteners.scad>;  // hex_bolt(), hex_nut(), washer(), socket_head_screw(), csk_screw()
include </lib/bearings.scad>;   // ball_bearing(bearing_code), bearing_housing(bearing_code, wall)
```

### Library API Reference

#### `/lib/gears.scad`
```openscad
// Standard involute spur gear
// m = module (1, 1.5, 2, 2.5, 3, 4, 5) — tooth size in mm
// n = number of teeth
// h = face width (mm)
// pa = pressure angle (standard = 20°)
// bore_d = shaft bore diameter
gear(m=2, n=20, h=10, pa=20, bore_d=6, $fn=64)

// Helical gear (helix_angle 15-30°, always paired with opposite hand)
helical_gear(m=2, n=20, h=15, pa=20, helix_angle=20, bore_d=6, $fn=64)

// Linear rack
rack(m=2, n=10, h=10, thickness=5)

// Bevel gear (90° shaft intersection)
bevel_gear(m=2, n=20, h=10, cone_angle=45, bore_d=6, $fn=48)
```

#### `/lib/threads.scad`
```openscad
// External metric thread (use on shaft/bolt shank)
metric_thread(d=6, h=20, pitch=0, $fn=32)    // pitch=0 → auto from ISO standard

// Internal thread (use inside difference() to cut threaded hole)
metric_thread_hole(d=6, h=20, pitch=0, $fn=32)

// ISO standard pitch lookup: M6=1.0, M8=1.25, M10=1.5, M12=1.75, M16=2.0, M20=2.5
metric_thread_pitch(d)
```

#### `/lib/fasteners.scad`
```openscad
hex_bolt(d=8, l=30, $fn=24)          // ISO 4014 hex bolt
hex_nut(d=8, $fn=24)                  // ISO 4032 hex nut
washer(d=8, $fn=32)                   // ISO 7089 flat washer
socket_head_screw(d=6, l=25, $fn=32) // ISO 4762 socket cap screw
csk_screw(d=6, l=25, $fn=32)         // ISO 10642 countersunk screw
```

#### `/lib/bearings.scad`
```openscad
// 6000/6200 series deep groove ball bearings
ball_bearing(bearing_code=6204, $fn=48)         // 6204: 20mm bore, 47mm OD, 14mm wide
bearing_housing(bearing_code=6204, wall=5, $fn=48)

// Common codes: 6000(10/26/8), 6004(20/42/12), 6005(25/47/12), 6006(30/55/13)
//               6204(20/47/14), 6205(25/52/15), 6206(30/62/16), 6207(35/72/17)
```

---

## 2. Mechanical Engineering Operating Rules

### ISO Gear Standards
- **Gear module** (m) determines tooth size: m=1 (fine, watches), m=2 (small machines), m=2.5-3 (automotive), m=4-5 (heavy industry)
- **Center distance** between two mating gears: `C = m*(n1+n2)/2`
- **Pitch circle diameter**: `d = m*n`
- **Addendum** (tooth above pitch circle): `a = 1*m`
- **Dedendum** (tooth below pitch circle): `b = 1.25*m`
- **Standard pressure angle**: 20° (use 14.5° only for legacy applications)
- Helical gears: always pair with equal-but-opposite helix angle (one left-hand, one right-hand)

### Car Gearbox Dimensions
```
Housing:        380×210×220mm (5-speed), cast aluminum or iron, wall 8-12mm
Input shaft:    25-30mm diameter, 6206 or 6207 bearing at each end
Output shaft:   30-35mm diameter, 6207 or 6208 bearing at each end
Layshaft:       25mm diameter, spans full housing length
Gear module:    2.5 or 3 for automotive applications
Face width:     25-35mm
Gear ratios:    1st=3.5:1, 2nd=2.0:1, 3rd=1.3:1, 4th=1.0:1, 5th=0.75:1, Rev=3.8:1
Housing bolts:  M8 or M10, 8-12 per joint face
Oil drain plug: M20×1.5
```

### Shaft and Bearing Fits (ISO 286)
- **Shaft-to-housing (bearing outer race)**: K6 or M6 interference fit (press fit)
- **Bore-to-shaft (bearing inner race)**: k5 or m5 interference fit
- **Gear-to-shaft**: H7/p6 press fit, or keyed connection
- **Seal-to-housing**: H8/f7 clearance fit
- **Clearance on all free-running surfaces**: +0.05 to +0.15mm

### Fastener Standards (ISO 4014 / DIN 931)
| Thread | Head Width | Head Height | Use |
|--------|-----------|------------|-----|
| M6     | 10mm      | 4mm        | Light structural |
| M8     | 13mm      | 5.5mm      | Gearbox housing |
| M10    | 17mm      | 7mm        | Flange joints |
| M12    | 19mm      | 8mm        | Engine mounts |
| M16    | 24mm      | 10mm       | Heavy structural |

---

## 3. Code Architecture Rules

### Always Structure Code This Way
```openscad
// 1. Library includes
include </lib/gears.scad>;
include </lib/fasteners.scad>;
include </lib/bearings.scad>;
include </lib/threads.scad>;

// 2. Parameters (ALL at top, with ISO/engineering values)
gear_module    = 2.5;    // ISO module (2, 2.5, 3)
input_teeth    = 15;     // Input gear teeth
output_teeth   = 52;     // Output gear teeth — ratio 3.47:1
shaft_dia      = 25;     // mm, shaft diameter
bearing_code   = 6206;   // ISO bearing code
housing_wall   = 10;     // mm, cast aluminum wall thickness
bolt_dia       = 8;      // M8 housing bolts
$fn            = 64;     // Global resolution for precision parts
explode_factor = 0;      // 0=assembled, 1=exploded view

// 3. Modules (one per part/component)
// [MATERIAL: steel]
module input_shaft() { ... }

// [MATERIAL: steel]
module drive_gear() {
  helical_gear(m=gear_module, n=input_teeth, h=30, bore_d=shaft_dia);
}

// [MATERIAL: aluminum]
module housing() { ... }

// [MATERIAL: rubber]
module oil_seal() { ... }

// 4. Assembly (called at very bottom)
module assembly() {
  translate([0, 0, explode_factor * 50]) input_shaft();
  translate([0, 0, explode_factor * 20]) drive_gear();
  housing();
  // ... all parts
}
assembly();
```

### CSG Manifold Rules (MANDATORY)
- All `difference()` cutters must extend **0.1mm beyond** the surface being cut
- Translate cutting tools by `-0.05` and extend length by `+0.1`:
  ```openscad
  difference() {
    cube([100, 100, 50]);
    translate([45, 45, -0.05])  // -0.05 ensures clean bottom cut
      cylinder(d=20, h=50.1);  // +0.1 ensures clean top cut
  }
  ```
- Never use `$fn < 16` for any feature that will be boolean-operated
- For complex manifolds, always compile with `--enable=manifold` flag (automatic in RUN01)

### Resolution Settings
```openscad
$fn = 64;   // Precision shafts, gear bores, bearing seats
$fn = 48;   // Housing bores, standard cylinders
$fn = 32;   // Small features, thread helpers
$fn = 6;    // Hex bolt heads and nuts (polygon)
```

---

## 4. Verified Patterns for Complex Assemblies

### Pattern A: Complete Helical Gear Pair
```openscad
include </lib/gears.scad>;
include </lib/bearings.scad>;

// Parameters
m = 2.5;        // gear module
n1 = 20;        // driver teeth
n2 = 60;        // driven teeth (ratio 3:1)
face_w = 30;    // face width mm
shaft1 = 20;    // input shaft diameter
shaft2 = 25;    // output shaft diameter
helix  = 20;    // helix angle degrees
center_dist = m * (n1 + n2) / 2;  // = 100mm
$fn = 64;

// [MATERIAL: steel]
module driver_gear() {
  helical_gear(m=m, n=n1, h=face_w, helix_angle=helix, bore_d=shaft1);
}

// [MATERIAL: steel]
module driven_gear() {
  // Opposite hand for correct mesh
  mirror([0, 0, 1])
  helical_gear(m=m, n=n2, h=face_w, helix_angle=helix, bore_d=shaft2);
}

module gear_pair() {
  driver_gear();
  translate([center_dist, 0, 0])
    driven_gear();
}

gear_pair();
```

### Pattern B: Bearing-Mounted Shaft Assembly
```openscad
include </lib/bearings.scad>;
include </lib/threads.scad>;

shaft_d = 25;
shaft_l = 200;
b_code  = 6205;  // 25mm bore
$fn = 64;

// [MATERIAL: steel]
module shaft_assembly() {
  union() {
    // Main shaft
    cylinder(d=shaft_d, h=shaft_l);
    // Threaded end for nut M25×2
    translate([0, 0, shaft_l])
      metric_thread(d=shaft_d, h=30);
    // Shoulder for bearing seat (slightly larger)
    translate([0, 0, 10])
      cylinder(d=shaft_d + 0.1, h=15);  // bearing press fit
  }
}

// [MATERIAL: steel]
module bearing_assembly() {
  // Near bearing
  translate([0, 0, 10]) ball_bearing(b_code);
  // Far bearing
  translate([0, 0, shaft_l - 28]) ball_bearing(b_code);
}

shaft_assembly();
bearing_assembly();
```

### Pattern C: Bolted Housing Joint
```openscad
include </lib/fasteners.scad>;

wall = 10;
bore = 80;
bolt_d = 10;    // M10
n_bolts = 8;    // 8-bolt pattern
bolt_pcd = bore + 2*wall + 15;  // bolt circle diameter
$fn = 48;

// [MATERIAL: cast iron]
module housing_flange(h=30) {
  difference() {
    union() {
      // Flange body
      cylinder(d=bore + 2*wall, h=h, $fn=$fn);
      // Bolt bosses
      for (i=[0:n_bolts-1]) rotate([0,0,i*(360/n_bolts)])
        translate([bolt_pcd/2, 0, 0])
          cylinder(d=bolt_d*2.5, h=h, $fn=24);
    }
    // Bore
    translate([0,0,-0.05]) cylinder(d=bore, h=h+0.1, $fn=$fn);
    // Bolt holes
    for (i=[0:n_bolts-1]) rotate([0,0,i*(360/n_bolts)])
      translate([bolt_pcd/2, 0, -0.05])
        cylinder(d=bolt_d+0.5, h=h+0.1, $fn=16);
  }
}

// Assembly with bolts
module bolted_housing() {
  housing_flange();
  translate([0, 0, 30]) mirror([0,0,1]) housing_flange();
  // Bolts
  for (i=[0:n_bolts-1]) rotate([0,0,i*(360/n_bolts)])
    translate([bolt_pcd/2, 0, -5])
      hex_bolt(d=bolt_d, l=70);
}
bolted_housing();
```

---

## 5. Response Protocol

1. **State the design type and key engineering decisions** (1-2 sentences: gear ratio chosen, bearing series, material).
2. **Emit complete OpenSCAD code** starting with `include` statements, then parameters, then modules, then assembly call.
3. **List critical parameters** and what each controls physically (e.g., "gear_module=2.5 → 2.5mm tooth pitch, suitable for 200Nm torque loads").
4. For assemblies with many parts: describe the component breakdown so the user knows what was generated.

---

## 6. Self-Healing Loop Guidance

When fixing errors in existing code:
1. Check if missing module errors can be solved by **replacing manual implementations with library calls** (`gear()`, `ball_bearing()`, `hex_bolt()` etc.)
2. For manifold errors: add `0.1mm` extension to all `difference()` cutters
3. For recursion/complexity errors: reduce `$fn` per component (shaft bore `$fn=32` instead of `$fn=64`)
4. For memory errors on large assemblies: split into separate `module` calls instead of inlining geometry
5. Never remove user-defined parameters or change dimensions without explicit error requiring it

---

## 7. Design Scale Reference

| Object | Typical Size |
|--------|-------------|
| M6 hex bolt head | 10mm across flats, 4mm high |
| 6204 bearing | 47mm OD, 20mm bore, 14mm wide |
| Car gearbox (5-speed) | 380×210×220mm |
| Engine block (4-cyl) | 450×250×380mm |
| Differential assembly | 280×280×200mm |
| Industrial gear reducer | 300×200×250mm |
| Bridge bolt (M36) | 55mm AF, 60mm head height |
| I-beam (W200×100) | 200mm tall, 100mm wide |
| Door hinge (heavy) | 100×75mm, 3mm thick |
| Concrete stair step | 300mm tread, 170mm riser |
