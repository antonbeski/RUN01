---
name: cad-studio
description: Authoritative guide for generating parametric OpenSCAD 3D models, CSG boolean geometry, dynamic UI parameters, and STL export in RUN01's in-browser CAD Studio.
argument-hint: "[3d-model-description] [parameters]"
metadata:
  author: run01
  version: "2.0.0"
---

# AI Parametric CAD Studio Skill (OpenSCAD WASM)

This skill instructs the AI on generating error-free, highly parametric OpenSCAD 3D models in RUN01. The in-browser CAD Studio compiles OpenSCAD source code directly to 3D meshes using WebAssembly and renders them in an interactive Three.js WebGL viewport.

---

## 1. Operating Rules for CAD Generation

1. **Pure OpenSCAD Code**: Always output valid, clean OpenSCAD code inside a fenced code block:
   ````markdown
   ```openscad
   [code]
   ```
   ````
2. **Expose Tunable Parameters at the Very Top**:
   Always place customizable dimension variables at the top of the file using clear descriptive names with numeric defaults and units:
   ```openscad
   // [Global Dimensions]
   width = 80;        // [10:200]
   length = 120;      // [10:300]
   height = 45;       // [5:150]
   wall_thickness = 3; // [1:10]
   corner_radius = 6; // [0:20]
   $fn = 60;          // Facet resolution for smooth curves
   ```
   *The RUN01 UI automatically parses top-level numeric variables into interactive sliders in the CAD Parameters panel!*

3. **Modular Architecture**:
   Structure parts into reusable `module name() { ... }` blocks and instantiate the primary assembly at the bottom:
   ```openscad
   module main_assembly() {
       difference() {
           outer_shell();
           inner_cavity();
       }
   }
   main_assembly();
   ```

4. **CSG Manifold Geometry (No Zero-Thickness Walls or Z-Fighting)**:
   When subtracting with `difference()`, always extend cutting tools by `0.1` mm beyond the target surface (`translate([..., -0.05])` with extra length `+0.1`) to ensure clean boolean manifolds without non-manifold edge artifacts or graphical flickering.

5. **Smooth Cylinders and Spheres**:
   Always set `$fn = 40` to `$fn = 80` for smooth cylindrical/spherical components without overwhelming WASM triangulation memory.

---

## 2. Parameter Extraction Standards for UI Sliders

To enable the RUN01 UI to generate dynamic input fields:
- Declare parameters with simple numeric assignments: `var_name = number;`.
- Use integer or float values.
- Optionally add comments describing range or units: `// in mm`.

---

## 3. Verified High-Precision Design Patterns

### Pattern A: Parametric Enclosure with Screw Mounts & Snap Fit
```openscad
// [Enclosure Parameters]
inner_length = 100;
inner_width = 70;
inner_height = 35;
wall = 2.5;
radius = 4;
boss_diam = 7;
screw_hole = 3.2;
$fn = 48;

module rounded_box(l, w, h, r) {
    translate([r, r, 0])
    minkowski() {
        cube([l - 2*r, w - 2*r, h - 1]);
        cylinder(r=r, h=1);
    }
}

module screw_boss(x, y) {
    translate([x, y, 0])
    difference() {
        cylinder(d=boss_diam, h=inner_height);
        translate([0, 0, -1])
            cylinder(d=screw_hole, h=inner_height + 2);
    }
}

module enclosure() {
    difference() {
        rounded_box(inner_length + 2*wall, inner_width + 2*wall, inner_height + wall, radius + wall);
        translate([wall, wall, wall])
            cube([inner_length, inner_width, inner_height + 1]);
    }
    
    // Corner screw bosses
    screw_boss(wall + boss_diam/2, wall + boss_diam/2);
    screw_boss(inner_length + wall - boss_diam/2, wall + boss_diam/2);
    screw_boss(wall + boss_diam/2, inner_width + wall - boss_diam/2);
    screw_boss(inner_length + wall - boss_diam/2, inner_width + wall - boss_diam/2);
}

enclosure();
```

### Pattern B: Involute / Spur Gear
```openscad
// [Gear Parameters]
num_teeth = 20;
pitch_radius = 40;
thickness = 10;
bore_radius = 6;
$fn = 64;

module tooth() {
    rotate([0, 0, -5])
    polygon(points=[[0,0], [pitch_radius*1.1, -2], [pitch_radius*1.1, 2], [0,0]]);
}

module gear() {
    difference() {
        union() {
            cylinder(r=pitch_radius, h=thickness);
            for (i = [0 : num_teeth - 1]) {
                rotate([0, 0, i * (360 / num_teeth)])
                translate([0, 0, 0])
                linear_extrude(height=thickness)
                polygon(points=[[pitch_radius*0.9, -3], [pitch_radius*1.12, -1.8], [pitch_radius*1.12, 1.8], [pitch_radius*0.9, 3]]);
            }
        }
        translate([0, 0, -1])
            cylinder(r=bore_radius, h=thickness + 2);
    }
}

gear();
```

---

## 4. Response Protocol

1. Explain the mechanical structure and key design decisions concisely (1-2 sentences).
2. Emit the complete, self-contained ` ```openscad ` code block.
3. List the customizable parameters with their design impact so the user knows what to adjust.
