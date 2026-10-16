// SpeedyBee 2807 1050kV Brushless Outrunner Drone Motor
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/bearings.scad>;
include </lib/fasteners.scad>;

rotor_d = 33.5;
rotor_h = 17.5;
stator_d = 28.0;
stator_h = 7.0;
shaft_d = 5.0;
explode_factor = 0;

module rotor_bell() {
  translate([0, 0, 8 + explode_factor*25]) {
    // Outer Bell
    difference() {
      cylinder(d=rotor_d, h=rotor_h, $fn=48);
      translate([0,0,-1]) cylinder(d=rotor_d - 3, h=rotor_h, $fn=48);
    }
    // Top Dome with cooling slots
    translate([0,0,rotor_h]) {
      difference() {
        cylinder(d=rotor_d, h=2.5, $fn=48);
        for(i=[0:3])
          rotate([0,0,i*90])
            translate([7, -2.5, -0.5]) cube([6, 5, 4]);
      }
      // Output prop shaft
      cylinder(d=shaft_d, h=14, $fn=24);
    }
  }
}

module stator_assembly() {
  // Base plate
  difference() {
    cylinder(d=32, h=4, $fn=36);
    // 19x19 M3 mounting holes
    for(x=[-9.5, 9.5], y=[-9.5, 9.5])
      translate([x, y, -0.5]) cylinder(d=3.2, h=5, $fn=16);
  }
  // Stator core
  translate([0, 0, 6]) {
    cylinder(d=stator_d, h=stator_h, $fn=36);
    // 12N stator poles
    for(i=[0:11])
      rotate([0,0,i*30])
        translate([stator_d/2 - 2, 0, 0])
          cylinder(d=3.5, h=stator_h, $fn=16);
  }
}

rotor_bell();
stator_assembly();
