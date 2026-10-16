// Aerodynamic Sports Car Chassis & Aero Domain
// Parametric OpenSCAD Model - RUN01 CAD Studio
length = 160;
width = 72;
wheelbase = 105;

module chassis_platform() {
  // Undertray
  translate([-length/2, -width/2, 0])
    cube([length, width, 4]);

  // Front Splitter
  translate([length/2 - 28, -width/2 - 2, 0])
    cube([28, width + 4, 3]);

  // Cockpit Greenhouse
  translate([-25, -20, 12])
    cube([50, 40, 20]);

  // Nose Hood
  translate([0, -width/2 + 4, 4])
    cube([length/2 - 5, width - 8, 12]);

  // Rear Engine Deck
  translate([-length/2 + 8, -width/2 + 4, 4])
    cube([length/2 - 8, width - 8, 14]);

  // Rear Wing
  translate([-length/2 + 2, -width/2 + 6, 34])
    cube([12, width - 12, 2.5]);
  // Wing Struts
  translate([-length/2 + 6, -12, 16]) cube([3, 2, 18]);
  translate([-length/2 + 6, 10, 16])  cube([3, 2, 18]);
}

chassis_platform();
