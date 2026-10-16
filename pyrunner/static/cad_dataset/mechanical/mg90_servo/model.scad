// MG90S Micro Metal Gear Servo Assembly
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/gears.scad>;
include </lib/fasteners.scad>;

body_l = 22.8;
body_w = 12.2;
body_h = 22.5;
flange_l = 32.5;
flange_t = 2.0;
spline_d = 4.8;
spline_h = 3.5;
horn_len = 16.0;
explode_factor = 0; // [0:0.1:1]

module servo_body() {
  difference() {
    translate([-body_l/2, -body_w/2, 0])
      cube([body_l, body_w, body_h]);
    // Corner screw reliefs
    for(dx=[-1, 1], dy=[-1, 1])
      translate([dx*(body_l/2-1), dy*(body_w/2-1), -0.1])
        cylinder(d=1.2, h=body_h+0.2, $fn=16);
  }
}

module servo_flange() {
  difference() {
    translate([-flange_l/2, -body_w/2, 16])
      cube([flange_l, body_w, flange_t]);
    // M2 mounting screw slots
    translate([-flange_l/2 + 2.5, 0, 15.5]) cylinder(d=2.2, h=flange_t+1, $fn=16);
    translate([flange_l/2 - 2.5, 0, 15.5])  cylinder(d=2.2, h=flange_t+1, $fn=16);
  }
}

module output_spline() {
  translate([-5.5, 0, body_h + explode_factor*10]) {
    cylinder(d=12, h=4.5, $fn=32);
    translate([0,0,4.5]) cylinder(d=spline_d, h=spline_h, $fn=24);
  }
}

module servo_horn() {
  translate([-5.5, 0, body_h + 4.5 + spline_h + explode_factor*20]) {
    cylinder(d=7, h=2, $fn=24);
    translate([0, -2, 0]) cube([horn_len, 4, 2]);
    translate([horn_len, 0, 0]) cylinder(d=5, h=2, $fn=20);
    // Linkage pushrod holes
    for(i=[4:3:horn_len])
      translate([i, 0, -0.1]) cylinder(d=1.2, h=2.2, $fn=12);
  }
}

// Complete Assembly
servo_body();
servo_flange();
output_spline();
servo_horn();
