// Raspberry Pi Zero W Single-Board Computer
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/pcb.scad>;

length = 65.0;
width = 30.0;
thick = 1.6;

// PCB Substrate
difference() {
  pcb_board(length=length, width=width, thickness=thick, corner_r=3.0);
  // 4 M2.5 mounting holes
  translate([3.5, 3.5, -0.5]) cylinder(d=2.7, h=thick+1, $fn=16);
  translate([length-3.5, 3.5, -0.5]) cylinder(d=2.7, h=thick+1, $fn=16);
  translate([3.5, width-3.5, -0.5]) cylinder(d=2.7, h=thick+1, $fn=16);
  translate([length-3.5, width-3.5, -0.5]) cylinder(d=2.7, h=thick+1, $fn=16);
}

// BCM2835 SoC
translate([length/2 - 6, width/2 - 6, thick])
  qfp(body_l=12, body_w=12, h=1.4, pin_pitch=0.65, pin_count_side=20);

// 40-pin GPIO Header
translate([7, width - 6.5, thick])
  pin_header(pins=20, rows=2, pitch=2.54, pin_h=6.0);

// Mini HDMI Connector
translate([12, 0, thick])
  cube([11.2, 7.5, 3.2]);

// 2x Micro USB Ports
translate([38, 0, thick]) usb_micro_b();
translate([52, 0, thick]) usb_micro_b();

// CSI Camera FFC Connector
translate([length - 4, 7, thick])
  cube([3.5, 16, 1.5]);
