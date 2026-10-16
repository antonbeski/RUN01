// 4-Cylinder Automotive Engine Block
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/threads.scad>;
include </lib/fasteners.scad>;

block_l = 140;
block_w = 68;
block_h = 75;
bore_d  = 28;
cylinder_pitch = 30;

module engine_block() {
  difference() {
    // Outer casting
    translate([-block_l/2, -block_w/2, 0])
      cube([block_l, block_w, block_h]);

    // 4 Cylinder bores
    for(i=[-1.5, -0.5, 0.5, 1.5]) {
      translate([i * cylinder_pitch, 0, -1])
        cylinder(d=bore_d, h=block_h + 2, $fn=48);
    }

    // Crankcase hollow chamber
    translate([-block_l/2 - 1, 0, 0])
      rotate([0, 90, 0])
        cylinder(d=block_w - 18, h=block_l + 2, $fn=36);

    // Cylinder head bolt holes
    for(x=[-50:25:50], y=[-26, 26]) {
      translate([x, y, block_h - 20])
        cylinder(d=5.5, h=21, $fn=20);
    }
  }

  // Sump mounting flange
  translate([-block_l/2 - 3, -block_w/2 - 3, 0])
    difference() {
      cube([block_l + 6, block_w + 6, 6]);
      translate([3, 3, -0.5]) cube([block_l, block_w, 7]);
    }
}

engine_block();
