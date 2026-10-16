// Arduino Mega 2560 R3 Development Board
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/pcb.scad>;

length = 101.6;
width = 53.3;
thick = 1.6;

// PCB Board
difference() {
  pcb_board(length=length, width=width, thickness=thick, corner_r=2.54);
  // Mounting holes
  translate([14, 2.5, -0.5]) cylinder(d=3.2, h=thick+1, $fn=16);
  translate([15.2, width-2.5, -0.5]) cylinder(d=3.2, h=thick+1, $fn=16);
  translate([length-14, 2.5, -0.5]) cylinder(d=3.2, h=thick+1, $fn=16);
  translate([length-14, width-2.5, -0.5]) cylinder(d=3.2, h=thick+1, $fn=16);
}

// ATmega2560 MCU
translate([45, 20, thick])
  qfp(body_l=16, body_w=16, h=1.4, pin_pitch=0.5, pin_count_side=25);

// USB Type-B Port
translate([0, width - 18, thick])
  cube([16, 12, 11]);

// DC Barrel Jack
translate([0, 5, thick])
  cube([14.5, 9, 11]);

// Double Row Digital Header (Pins 22-53)
translate([length - 6, 8, thick])
  pin_header(pins=18, rows=2, pitch=2.54, pin_h=8.5);

// Top / Bottom Headers
translate([28, width - 3.5, thick])
  pin_header(pins=20, rows=1, pitch=2.54, pin_h=8.5);
translate([28, 1, thick])
  pin_header(pins=20, rows=1, pitch=2.54, pin_h=8.5);
