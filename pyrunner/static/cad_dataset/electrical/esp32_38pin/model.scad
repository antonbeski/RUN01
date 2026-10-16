// ESP32 NodeMCU-32S 38-Pin Development Board
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/pcb.scad>;

length = 55.0;
width = 28.0;
thick = 1.6;

// Main Board
pcb_board(length=length, width=width, thickness=thick, corner_r=2.5);

// ESP-WROOM-32 Module
translate([4, (width-25)/2, thick]) {
  // Shield can
  cube([25.5, 25, 3.2]);
  // Antenna section
  translate([25.5, 0, 0]) cube([6, 25, 0.8]);
}

// Twin 19-pin header strips
translate([5, 1.5, -6])
  pin_header(pins=19, rows=1, pitch=2.54, pin_h=8.5);
translate([5, width - 4.0, -6])
  pin_header(pins=19, rows=1, pitch=2.54, pin_h=8.5);

// USB Receptacle
translate([length - 7.5, (width - 8)/2, thick])
  usb_type_c();

// Buttons
translate([length - 12, 3, thick]) cube([4, 3.5, 2]);
translate([length - 12, width - 6.5, thick]) cube([4, 3.5, 2]);
