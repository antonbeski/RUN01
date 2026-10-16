// Compact Axial Flow Turbojet Engine Assembly
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/bearings.scad>;
include </lib/fasteners.scad>;

length = 120;
d_intake = 64;
d_mid = 72;
d_nozzle = 52;
explode_factor = 0;

module nacelle() {
  difference() {
    union() {
      cylinder(d1=d_intake, d2=d_mid, h=length*0.4, $fn=48);
      translate([0,0,length*0.4]) cylinder(d=d_mid, h=length*0.35, $fn=48);
      translate([0,0,length*0.75]) cylinder(d1=d_mid, d2=d_nozzle, h=length*0.25, $fn=48);
    }
    translate([0,0,-1]) cylinder(d1=d_intake-4, d2=d_mid-4, h=length*0.4+1, $fn=48);
    translate([0,0,length*0.4]) cylinder(d=d_mid-4, h=length*0.35, $fn=48);
    translate([0,0,length*0.75]) cylinder(d1=d_mid-4, d2=d_nozzle-4, h=length*0.25+2, $fn=48);
  }
}

module compressor_stage(z_pos, blade_count, radius) {
  translate([0,0,z_pos + explode_factor*25]) {
    cylinder(r=radius*0.4, h=4, $fn=32);
    for(i=[0:blade_count-1])
      rotate([0, 0, i * 360 / blade_count])
        translate([radius*0.35, -0.8, 0])
          rotate([0, 25, 0])
            cube([radius*0.6, 1.6, 6]);
  }
}

module turbine_wheel() {
  translate([0,0,length*0.75 + explode_factor*40]) {
    cylinder(d=16, h=5, $fn=32);
    for(i=[0:15])
      rotate([0, 0, i * 22.5])
        translate([8, -0.9, 0])
          rotate([0, -30, 0])
            cube([12, 1.8, 7]);
  }
}

// Assembly
nacelle();
compressor_stage(20, 12, 28);
compressor_stage(36, 14, 26);
turbine_wheel();
// Center Shaft
cylinder(d=6, h=length-10, $fn=24);
