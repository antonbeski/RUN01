// MSI X370 Gaming Pro Carbon ATX Motherboard
// Parametric OpenSCAD Model - RUN01 CAD Studio
include </lib/pcb.scad>;

l = 305;
w = 244;
t = 1.6;

// ATX Form Factor PCB
pcb_board(length=l, width=w, thickness=t, corner_r=4);

// AM4 CPU Socket
translate([75, 120, t]) {
  difference() {
    cube([45, 45, 7]);
    translate([5, 5, 2]) cube([35, 35, 6]);
  }
}

// 4x DDR4 DIMM Slots
for(i=[0:3]) {
  translate([135 + i*11, 80, t])
    cube([7, 138, 9]);
}

// 3x PCIe x16 Steel Armor Slots
for(i=[0:2]) {
  translate([30, 45 + i*35, t])
    cube([125, 9, 11]);
}

// VRM Heatsinks
translate([25, 115, t]) cube([35, 75, 28]);
translate([65, 175, t]) cube([70, 30, 24]);

// Chipset Heatsink
translate([185, 35, t]) cube([50, 50, 16]);

// ATX 24-Pin Power Header
translate([235, 140, t]) pin_header(pins=12, rows=2, pitch=4.2, pin_h=10);
