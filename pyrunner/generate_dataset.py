"""
Dataset generator for RUN01 CAD Studio:
Compiles authoritative parametric specifications, OpenSCAD source models,
and optimized binary STL 3D geometry for both Mechanical and Electrical CAD datasets.
"""
import os
import json
import struct
import math

DATASET_ROOT = os.path.join(os.path.dirname(__file__), 'static', 'cad_dataset')

class MeshBuilder:
    def __init__(self):
        self.triangles = []

    def add_triangle(self, v1, v2, v3):
        ax, ay, az = v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]
        bx, by, bz = v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]
        nx = ay * bz - az * by
        ny = az * bx - ax * bz
        nz = ax * by - ay * bx
        l = math.sqrt(nx*nx + ny*ny + nz*nz)
        if l > 1e-9:
            nx /= l; ny /= l; nz /= l
        else:
            nx, ny, nz = 0.0, 0.0, 1.0
        self.triangles.append(((nx, ny, nz), v1, v2, v3))

    def add_quad(self, v1, v2, v3, v4):
        self.add_triangle(v1, v2, v3)
        self.add_triangle(v1, v3, v4)

    def add_box(self, x, y, z, dx, dy, dz):
        p0 = (x, y, z)
        p1 = (x + dx, y, z)
        p2 = (x + dx, y + dy, z)
        p3 = (x, y + dy, z)
        p4 = (x, y, z + dz)
        p5 = (x + dx, y, z + dz)
        p6 = (x + dx, y + dy, z + dz)
        p7 = (x, y + dy, z + dz)
        self.add_quad(p0, p3, p2, p1)
        self.add_quad(p4, p5, p6, p7)
        self.add_quad(p0, p1, p5, p4)
        self.add_quad(p3, p7, p6, p2)
        self.add_quad(p0, p4, p7, p3)
        self.add_quad(p1, p2, p6, p5)

    def add_cylinder(self, cx, cy, cz, radius, height, segments=24, cap_bottom=True, cap_top=True):
        angles = [2 * math.pi * i / segments for i in range(segments)]
        for i in range(segments):
            a1 = angles[i]
            a2 = angles[(i + 1) % segments]
            x1, y1 = cx + radius * math.cos(a1), cy + radius * math.sin(a1)
            x2, y2 = cx + radius * math.cos(a2), cy + radius * math.sin(a2)
            self.add_quad((x1, y1, cz), (x2, y2, cz), (x2, y2, cz + height), (x1, y1, cz + height))
            if cap_bottom:
                self.add_triangle((cx, cy, cz), (x2, y2, cz), (x1, y1, cz))
            if cap_top:
                self.add_triangle((cx, cy, cz + height), (x1, y1, cz + height), (x2, y2, cz + height))

    def add_tube(self, cx, cy, cz, r_out, r_in, height, segments=24):
        angles = [2 * math.pi * i / segments for i in range(segments)]
        for i in range(segments):
            a1 = angles[i]
            a2 = angles[(i + 1) % segments]
            xo1, yo1 = cx + r_out * math.cos(a1), cy + r_out * math.sin(a1)
            xo2, yo2 = cx + r_out * math.cos(a2), cy + r_out * math.sin(a2)
            xi1, yi1 = cx + r_in * math.cos(a1), cy + r_in * math.sin(a1)
            xi2, yi2 = cx + r_in * math.cos(a2), cy + r_in * math.sin(a2)
            self.add_quad((xo1, yo1, cz), (xo2, yo2, cz), (xo2, yo2, cz + height), (xo1, yo1, cz + height))
            self.add_quad((xi2, yi2, cz), (xi1, yi1, cz), (xi1, yi1, cz + height), (xi2, yi2, cz + height))
            self.add_quad((xo1, yo1, cz), (xi1, yi1, cz), (xi2, yi2, cz), (xo2, yo2, cz))
            self.add_quad((xo1, yo1, cz + height), (xo2, yo2, cz + height), (xi2, yi2, cz + height), (xi1, yi1, cz + height))

    def to_binary_stl(self):
        header = b'RUN01 CAD Studio Optimized Binary STL Asset' + b'\x00' * (80 - len('RUN01 CAD Studio Optimized Binary STL Asset'))
        num_triangles = len(self.triangles)
        out = bytearray(header)
        out.extend(struct.pack('<I', num_triangles))
        for (nx, ny, nz), (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) in self.triangles:
            out.extend(struct.pack('<fff fff fff fff H',
                nx, ny, nz,
                x1, y1, z1,
                x2, y2, z2,
                x3, y3, z3,
                0
            ))
        return bytes(out)


# -------------------------------------------------------------
# 1. MECHANICAL MODELS
# -------------------------------------------------------------

def build_mg90_servo():
    mb = MeshBuilder()
    # Main body casing
    body_l, body_w, body_h = 22.8, 12.2, 22.5
    mb.add_box(-body_l/2, -body_w/2, 0, body_l, body_w, body_h)
    # Mounting flange
    flange_l, flange_w, flange_h = 32.5, 12.0, 2.0
    mb.add_box(-flange_l/2, -flange_w/2, 16.0, flange_l, flange_w, flange_h)
    # Output gear tower
    mb.add_cylinder(-5.5, 0, body_h, 6.0, 4.5, segments=24)
    # Output splined brass shaft
    mb.add_cylinder(-5.5, 0, body_h + 4.5, 2.4, 3.5, segments=16)
    # Secondary gear bulge
    mb.add_cylinder(4.5, 0, body_h, 4.0, 2.0, segments=18)
    # Servo Horn arm
    mb.add_cylinder(-5.5, 0, body_h + 6.0, 3.5, 1.8, segments=18)
    mb.add_box(-5.5, -2.0, body_h + 6.0, 16.0, 4.0, 1.8)
    mb.add_cylinder(10.5, 0, body_h + 6.0, 2.5, 1.8, segments=14)
    # 3-wire ribbon cable lead
    mb.add_box(-3.0, -body_w/2 - 4.0, 2.0, 6.0, 4.0, 1.2)

    spec = {
        "name": "mg90_servo",
        "title": "MG90S Micro Metal Gear Servo Assembly",
        "category": "mechanical",
        "type": "mechanical",
        "units": "mm",
        "source_file": "MG90servo_assembly.STEP",
        "dimensions": {"length": 32.5, "width": 12.2, "height": 30.5},
        "default_material": "steel",
        "parameters": {
            "body_length": 22.8,
            "body_width": 12.2,
            "body_height": 22.5,
            "flange_length": 32.5,
            "flange_thickness": 2.0,
            "spline_diameter": 4.8,
            "spline_height": 3.5,
            "horn_length": 16.0,
            "gear_module": 0.4,
            "operating_voltage": 4.8,
            "stall_torque_kg_cm": 2.2,
            "explode_factor": 0
        },
        "parts": ["lower_case", "middle_case", "top_case_gearbox", "metal_gear_train", "output_spline", "servo_horn", "3_pin_cable"],
        "features": ["metal gear train", "brass output shaft with 21T spline", "dual mounting tabs with M2 eyelets", "reinforced polycarbonate casing"],
        "standards": ["ISO 286", "DIN 933", "JIS B 1701"]
    }

    scad = """// MG90S Micro Metal Gear Servo Assembly
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
"""
    return spec, scad, mb.to_binary_stl()


def build_turbojet_engine():
    mb = MeshBuilder()
    # Outer nacelle casing
    length = 120.0
    r_front = 32.0
    r_mid = 36.0
    r_nozzle = 26.0

    # Intake section
    mb.add_tube(0, 0, 0, r_front, r_front - 2.5, 20.0, segments=32)
    # Compressor stage casing
    mb.add_tube(0, 0, 20.0, r_mid, r_mid - 2.5, 35.0, segments=32)
    # Combustor chamber casing
    mb.add_tube(0, 0, 55.0, r_mid, r_mid - 2.5, 35.0, segments=32)
    # Turbine & exhaust nozzle
    mb.add_tube(0, 0, 90.0, r_nozzle, r_nozzle - 2.5, 30.0, segments=32)

    # Center shaft
    mb.add_cylinder(0, 0, 10.0, 5.0, 95.0, segments=18)
    # Intake nose cone
    mb.add_cylinder(0, 0, 5.0, 9.0, 15.0, segments=20)

    # 1st stage compressor rotor blades
    for a in [i * math.pi / 6 for i in range(12)]:
        bx = 18.0 * math.cos(a)
        by = 18.0 * math.sin(a)
        mb.add_box(bx - 1.2, by - 1.2, 22.0, 2.4, 2.4, 10.0)

    # 2nd stage compressor rotor
    for a in [i * math.pi / 7 for i in range(14)]:
        bx = 16.0 * math.cos(a)
        by = 16.0 * math.sin(a)
        mb.add_box(bx - 1.0, by - 1.0, 36.0, 2.0, 2.0, 8.0)

    # Turbine stator guide vanes
    for a in [i * math.pi / 8 for i in range(16)]:
        bx = 14.0 * math.cos(a)
        by = 14.0 * math.sin(a)
        mb.add_box(bx - 0.8, by - 0.8, 88.0, 1.6, 1.6, 6.0)

    # Exhaust bullet cone
    mb.add_cylinder(0, 0, 105.0, 7.0, 20.0, segments=18)

    spec = {
        "name": "turbojet_engine",
        "title": "Compact Axial Flow Turbojet Engine Assembly",
        "category": "mechanical",
        "type": "mechanical",
        "units": "mm",
        "source_file": "TurboJetEngine.STEP",
        "dimensions": {"diameter": 72.0, "length": 125.0, "weight_kg": 1.45},
        "default_material": "aluminum",
        "parameters": {
            "intake_diameter": 64.0,
            "max_casing_diameter": 72.0,
            "exhaust_nozzle_diameter": 52.0,
            "total_length": 120.0,
            "compressor_stages": 2,
            "rotor_blade_count": 12,
            "turbine_inlet_temp_c": 950,
            "max_rpm": 115000,
            "thrust_n": 140,
            "explode_factor": 0
        },
        "parts": ["intake_nacelle", "center_bullet_cone", "multistage_axial_compressor", "combustion_chamber", "turbine_wheel", "exhaust_cone", "main_shaft", "hybrid_ceramic_bearings"],
        "features": ["twin axial compressor stages", "annular reverse-flow combustor", "Inconel 718 turbine wheel", "convergent thrust nozzle"],
        "standards": ["ISO 286", "AS9100D", "MIL-STD-1530C"]
    }

    scad = """// Compact Axial Flow Turbojet Engine Assembly
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
"""
    return spec, scad, mb.to_binary_stl()


def build_engine_block_v4():
    mb = MeshBuilder()
    # Main block casting (4 cylinders inline)
    block_l, block_w, block_h = 140.0, 68.0, 75.0
    mb.add_box(-block_l/2, -block_w/2, 0, block_l, block_w, block_h)

    # 4 cylinder bores
    bore_r = 14.0
    bore_spacing = 30.0
    for idx, cx in enumerate([-45.0, -15.0, 15.0, 45.0]):
        # Cylinder liner top flange
        mb.add_cylinder(cx, 0, block_h, bore_r + 2.5, 2.5, segments=24)
        # Inner bore relief
        mb.add_tube(cx, 0, 5.0, bore_r + 2.0, bore_r, block_h - 5.0, segments=24)

    # Side coolant jacket ribs
    for side in [-1, 1]:
        mb.add_box(-block_l/2 + 6, side * (block_w/2), 15.0, block_l - 12, 4.0 * side, 40.0)

    # Crankcase bottom skirt & oil pan rail
    mb.add_box(-block_l/2 - 4.0, -block_w/2 - 4.0, 0, block_l + 8.0, block_w + 8.0, 8.0)

    # 5 crankshaft main bearing saddles
    for cx in [-58.0, -30.0, 0.0, 30.0, 58.0]:
        mb.add_box(cx - 4.0, -16.0, 0, 8.0, 32.0, 14.0)
        mb.add_cylinder(cx, 0, 0, 10.0, 14.0, segments=20)

    spec = {
        "name": "engine_block_v4",
        "title": "4-Cylinder Automotive Engine Block Casting",
        "category": "mechanical",
        "type": "mechanical",
        "units": "mm",
        "source_file": "Product2_ENGINE_BLOCK.stp",
        "dimensions": {"length": 140.0, "width": 68.0, "height": 77.5},
        "default_material": "iron",
        "parameters": {
            "bore_diameter": 80.0,
            "stroke": 89.0,
            "cylinder_count": 4,
            "cylinder_spacing": 90.0,
            "deck_height": 220.0,
            "main_journal_diameter": 55.0,
            "main_bearing_saddles": 5,
            "cooling_jacket_wall": 8.0,
            "head_bolt_size": "M11x1.5",
            "explode_factor": 0
        },
        "parts": ["monobloc_crankcase", "cylinder_siamese_bores", "water_cooling_passages", "crankshaft_main_bearing_caps", "oil_gallery_feed", "bellhousing_flange"],
        "features": ["cross-bolted 5 main bearing saddles", "siamese wet cylinder sleeves", "perimeter oil pan gasket rail", "reinforced starter and alternator bosses"],
        "standards": ["ISO 286 H7", "DIN EN 1561 GJL-250", "SAE J431"]
    }

    scad = """// 4-Cylinder Automotive Engine Block
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
"""
    return spec, scad, mb.to_binary_stl()


def build_sports_car_chassis():
    mb = MeshBuilder()
    # Sports car body / chassis aerodynamic domain
    l, w, h = 160.0, 72.0, 42.0

    # Lower floorpan / aerodynamic flat undertray
    mb.add_box(-l/2, -w/2, 0, l, w, 4.0)

    # Front nose & splitter
    mb.add_box(l/2 - 30.0, -w/2 - 2.0, 0, 30.0, w + 4.0, 5.0)

    # Main cabin / cockpit canopy
    mb.add_box(-30.0, -22.0, 14.0, 60.0, 44.0, 22.0)

    # Hood section
    mb.add_box(0, -w/2 + 4.0, 4.0, l/2 - 5.0, w - 8.0, 14.0)

    # Rear engine bay cover
    mb.add_box(-l/2 + 10.0, -w/2 + 4.0, 4.0, l/2 - 10.0, w - 8.0, 16.0)

    # 4 Wheelhouse arches
    for fx in [l/2 - 35.0, -l/2 + 35.0]:
        for fy in [-w/2, w/2]:
            mb.add_box(fx - 14.0, fy - (3.0 if fy > 0 else -3.0), 0, 28.0, 6.0 * (1 if fy > 0 else -1), 18.0)

    # Rear downforce wing
    mb.add_box(-l/2 + 2.0, -w/2 + 6.0, 36.0, 12.0, w - 12.0, 2.5)
    # Wing pylons
    mb.add_box(-l/2 + 5.0, -14.0, 18.0, 4.0, 2.5, 18.0)
    mb.add_box(-l/2 + 5.0, 11.5, 18.0, 4.0, 2.5, 18.0)

    # Rear diffuser strakes
    for dy in [-16.0, -5.0, 5.0, 16.0]:
        mb.add_box(-l/2, dy - 0.8, 0, 25.0, 1.6, 6.0)

    spec = {
        "name": "sports_car_chassis",
        "title": "Aerodynamic Sports Car Chassis & Aero Domain",
        "category": "mechanical",
        "type": "mechanical",
        "units": "mm",
        "source_file": "domain car2.STEP",
        "dimensions": {"length": 160.0, "width": 76.0, "height": 38.5},
        "default_material": "aluminum",
        "parameters": {
            "wheelbase": 105.0,
            "track_width_front": 68.0,
            "track_width_rear": 72.0,
            "ground_clearance": 4.0,
            "front_splitter_overhang": 28.0,
            "rear_wing_span": 60.0,
            "rear_wing_height": 36.0,
            "diffuser_angle_deg": 12.0,
            "drag_coefficient_cd": 0.28,
            "downforce_cl": -0.65,
            "explode_factor": 0
        },
        "parts": ["carbon_monocoque", "front_splitter_assembly", "vented_bonnet", "aerodynamic_cockpit", "rear_diffuser", "adjustable_downforce_wing", "side_radiator_pods"],
        "features": ["underbody venturi tunnels", "high-downforce swan-neck wing mounts", "sculpted wheel arch extractors", "CFD-optimized frontal stagnation zone"],
        "standards": ["FIA Appendix J", "ISO 286", "DIN 70010"]
    }

    scad = """// Aerodynamic Sports Car Chassis & Aero Domain
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
"""
    return spec, scad, mb.to_binary_stl()


# -------------------------------------------------------------
# 2. ELECTRICAL MODELS
# -------------------------------------------------------------

def build_raspberry_pi_zero_w():
    mb = MeshBuilder()
    # 65x30mm PCB
    pcb_l, pcb_w, pcb_t = 65.0, 30.0, 1.6
    mb.add_box(-pcb_l/2, -pcb_w/2, 0, pcb_l, pcb_w, pcb_t)

    # 40-pin GPIO dual-row header (2x20 pins)
    mb.add_box(-pcb_l/2 + 5.0, pcb_w/2 - 6.0, pcb_t, 51.0, 5.0, 3.0)
    for px in range(20):
        for py in range(2):
            mb.add_cylinder(-pcb_l/2 + 6.5 + px * 2.54, pcb_w/2 - 4.5 + py * 2.54, pcb_t + 3.0, 0.4, 5.0, segments=8)

    # BCM2835 SoC processor
    mb.add_box(-4.0, -6.0, pcb_t, 12.0, 12.0, 1.4)

    # Mini HDMI port
    mb.add_box(-pcb_l/2 + 10.0, -pcb_w/2 - 1.5, pcb_t, 11.0, 7.5, 3.2)

    # 2x Micro USB ports (USB OTG + PWR)
    mb.add_box(pcb_l/2 - 25.0, -pcb_w/2 - 1.5, pcb_t, 8.0, 6.0, 3.0)
    mb.add_box(pcb_l/2 - 12.0, -pcb_w/2 - 1.5, pcb_t, 8.0, 6.0, 3.0)

    # MicroSD card slot on bottom
    mb.add_box(-pcb_l/2 - 1.0, -7.0, -1.8, 14.0, 14.0, 1.8)

    # CSI camera connector
    mb.add_box(pcb_l/2 - 4.0, -8.0, pcb_t, 3.5, 16.0, 1.5)

    # Wireless shield can (Wi-Fi 802.11b/g/n + BT)
    mb.add_box(-pcb_l/2 + 5.0, -pcb_w/2 + 4.0, pcb_t, 12.0, 10.0, 1.5)

    # 4 M2.5 mounting holes
    for hx in [-pcb_l/2 + 3.5, pcb_l/2 - 3.5]:
        for hy in [-pcb_w/2 + 3.5, pcb_w/2 - 3.5]:
            mb.add_cylinder(hx, hy, 0, 1.35, pcb_t, segments=12)

    spec = {
        "name": "raspberry_pi_zero_w",
        "title": "Raspberry Pi Zero W Single-Board Computer",
        "category": "electrical",
        "type": "pcb",
        "units": "mm",
        "source_file": "RaspberryPiZeroW.STEP",
        "dimensions": {"length": 65.0, "width": 30.0, "thickness": 5.0},
        "default_material": "pcb_fr4",
        "parameters": {
            "board_length": 65.0,
            "board_width": 30.0,
            "pcb_thickness": 1.6,
            "gpio_pin_count": 40,
            "gpio_pitch": 2.54,
            "soc_package": "BGA-168",
            "soc_size": 12.0,
            "mounting_hole_dia": 2.7,
            "mounting_hole_inset": 3.5,
            "wifi_bluetooth": "CYW43438",
            "explode_factor": 0
        },
        "parts": ["fr4_multilayer_pcb", "bcm2835_soc", "40_pin_gpio_header", "mini_hdmi_port", "micro_usb_otg", "micro_usb_pwr", "csi_camera_connector", "microsd_socket", "wifi_shield_can"],
        "features": ["40-pin 0.1-inch GPIO header", "dual Micro-USB 2.0 connectors", "mini-HDMI 1080p output", "onboard 2.4GHz ceramic antenna", "4x M2.5 mounting holes"],
        "standards": ["IPC-7351B", "IPC-2221", "Raspberry Pi HAT spec"]
    }

    scad = """// Raspberry Pi Zero W Single-Board Computer
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
"""
    return spec, scad, mb.to_binary_stl()


def build_esp32_38pin():
    mb = MeshBuilder()
    # 55x28mm PCB
    l, w, t = 55.0, 28.0, 1.6
    mb.add_box(-l/2, -w/2, 0, l, w, t)

    # ESP-WROOM-32 shielded metal module (18x25.5mm)
    mb.add_box(-l/2 + 4.0, -12.5, t, 25.5, 25.0, 3.2)
    # PCB trace antenna section
    mb.add_box(-l/2 + 29.5, -12.5, t, 6.0, 25.0, 0.8)

    # Twin 19-pin header strips (left and right)
    for y_pos in [-w/2 + 2.0, w/2 - 4.5]:
        mb.add_box(-l/2 + 4.0, y_pos, t, 48.0, 2.5, 2.5)
        for i in range(19):
            mb.add_cylinder(-l/2 + 5.0 + i * 2.54, y_pos + 1.25, t + 2.5, 0.35, 6.0, segments=8)

    # Micro USB / Type-C connector at top edge
    mb.add_box(l/2 - 7.5, -4.5, t, 8.0, 9.0, 3.2)

    # Reset (EN) and Boot buttons
    mb.add_box(l/2 - 12.0, -w/2 + 4.0, t, 4.0, 3.5, 2.0)
    mb.add_box(l/2 - 12.0, w/2 - 7.5, t, 4.0, 3.5, 2.0)

    # AMS1117 3.3V LDO Voltage Regulator (SOT-223)
    mb.add_box(l/2 - 20.0, -3.5, t, 6.5, 4.0, 1.8)

    spec = {
        "name": "esp32_38pin",
        "title": "ESP32 NodeMCU-32S 38-Pin Development Board",
        "category": "electrical",
        "type": "pcb",
        "units": "mm",
        "source_file": "PCB_ESP32-38Pines.STEP",
        "dimensions": {"length": 55.0, "width": 28.0, "thickness": 12.5},
        "default_material": "pcb_fr4",
        "parameters": {
            "board_length": 55.0,
            "board_width": 28.0,
            "pin_count": 38,
            "header_rows": 2,
            "pin_pitch": 2.54,
            "row_spacing": 25.4,
            "module_size_x": 25.5,
            "module_size_y": 18.0,
            "usb_interface": "CP2102 / CH340",
            "flash_memory_mb": 4,
            "explode_factor": 0
        },
        "parts": ["fr4_circuit_board", "esp_wroom_32_module", "rf_shield_can", "pcb_trace_antenna", "twin_19_pin_male_headers", "micro_usb_connector", "ams1117_regulator", "tactile_switches"],
        "features": ["dual-core Xtensa 32-bit LX6 @ 240MHz", "Wi-Fi 802.11 b/g/n & BLE 4.2", "twin 19-pin 2.54mm breadboard headers", "integrated 3.3V LDO regulator"],
        "standards": ["IPC-7351B", "FCC ID 2AC7Z-ESPWROOM32", "RoHS"]
    }

    scad = """// ESP32 NodeMCU-32S 38-Pin Development Board
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
"""
    return spec, scad, mb.to_binary_stl()


def build_msi_x370_motherboard():
    mb = MeshBuilder()
    # Full ATX Motherboard (305 x 244mm scaled for fast viewport)
    l, w, t = 152.0, 122.0, 1.6 # 1:2 display scale
    mb.add_box(-l/2, -w/2, 0, l, w, t)

    # AM4 CPU Socket (40 x 40mm)
    mb.add_box(-15.0, 15.0, t, 22.0, 22.0, 3.5)

    # 4x DDR4 RAM DIMM slots
    for idx in range(4):
        mb.add_box(16.0 + idx * 5.0, 5.0, t, 3.2, 58.0, 4.5)

    # 3x PCIe x16 expansion slots
    for idx, py in enumerate([-12.0, -28.0, -44.0]):
        mb.add_box(-l/2 + 10.0, py, t, 52.0, 4.0, 5.0)

    # VRM Aluminum finned heatsinks (North and West of CPU)
    mb.add_box(-42.0, 12.0, t, 16.0, 32.0, 14.0)
    mb.add_box(-20.0, 42.0, t, 34.0, 14.0, 12.0)

    # Rear I/O shield & ports cluster
    mb.add_box(-l/2 + 2.0, 10.0, t, 12.0, 46.0, 18.0)

    # Chipset heatsink (South bridge)
    mb.add_box(20.0, -38.0, t, 24.0, 24.0, 8.0)

    # 24-pin ATX power connector
    mb.add_box(l/2 - 8.0, 20.0, t, 6.0, 24.0, 6.0)

    # Audio circuit capacitors
    for cx in range(5):
        mb.add_cylinder(-l/2 + 12.0, -18.0 - cx * 6.0, t, 2.5, 6.0, segments=12)

    spec = {
        "name": "msi_x370_motherboard",
        "title": "MSI X370 Gaming Pro Carbon ATX Motherboard",
        "category": "electrical",
        "type": "pcb",
        "units": "mm",
        "source_file": "MSI X370 Gaming Pro Carbon.STEP",
        "dimensions": {"length": 305.0, "width": 244.0, "thickness": 35.0},
        "default_material": "pcb_fr4",
        "parameters": {
            "form_factor": "ATX",
            "board_length": 305.0,
            "board_width": 244.0,
            "cpu_socket": "Socket AM4",
            "ddr4_slots": 4,
            "pcie_x16_slots": 3,
            "pcie_x1_slots": 3,
            "m2_slots": 2,
            "vrm_power_phases": 10,
            "sata_ports": 6,
            "explode_factor": 0
        },
        "parts": ["atx_6layer_pcb", "am4_cpu_socket", "4x_ddr4_steel_armor_dimms", "3x_pcie_steel_armor_slots", "dual_finned_vrm_heatsinks", "carbon_chipset_heatsink", "m2_shield_frozr", "rear_io_cluster", "audio_boost_capacitors"],
        "features": ["AMD AM4 Ryzen socket", "Steel Armor reinforced PCIe and DIMM slots", "Dual Turbo M.2 with Shield Frozr", "Audio Boost 4 with isolated audio PCB", "Mystic Light RGB synchronization"],
        "standards": ["ATX Specification 2.2", "IPC-7351B", "PCIe Base 3.0", "JEDEC DDR4"]
    }

    scad = """// MSI X370 Gaming Pro Carbon ATX Motherboard
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
"""
    return spec, scad, mb.to_binary_stl()


def build_arduino_mega_2560():
    mb = MeshBuilder()
    # 101.6 x 53.3mm PCB
    l, w, t = 101.6, 53.3, 1.6
    mb.add_box(-l/2, -w/2, 0, l, w, t)

    # ATmega2560 MCU (TQFP-100)
    mb.add_box(-10.0, -8.0, t, 16.0, 16.0, 1.4)

    # USB Type-B Port
    mb.add_box(-l/2 + 2.0, w/2 - 18.0, t, 16.0, 12.0, 11.0)

    # DC Barrel Jack (2.1mm)
    mb.add_box(-l/2 + 2.0, -w/2 + 4.0, t, 14.5, 9.0, 11.0)

    # Double row header at right edge (54 digital I/O lines)
    mb.add_box(l/2 - 7.0, -w/2 + 8.0, t, 5.0, 38.0, 4.0)
    for row in range(2):
        for pin in range(18):
            mb.add_cylinder(l/2 - 5.5 + row * 2.54, -w/2 + 10.0 + pin * 2.0, t + 4.0, 0.35, 5.0, segments=8)

    # Top and bottom single-row headers
    mb.add_box(-l/2 + 28.0, w/2 - 4.5, t, 48.0, 2.5, 4.0)
    mb.add_box(-l/2 + 28.0, -w/2 + 2.0, t, 48.0, 2.5, 4.0)

    # 16MHz Crystal Oscillator
    mb.add_box(-l/2 + 20.0, 0, t, 11.0, 4.5, 3.5)

    # Reset button
    mb.add_box(-l/2 + 6.0, 4.0, t, 6.0, 6.0, 4.0)

    spec = {
        "name": "arduino_mega_2560",
        "title": "Arduino Mega 2560 R3 Microcontroller Board",
        "category": "electrical",
        "type": "pcb",
        "units": "mm",
        "source_file": "ArduinoMega_STEP_AP203.STEP",
        "dimensions": {"length": 101.6, "width": 53.3, "thickness": 14.5},
        "default_material": "pcb_fr4",
        "parameters": {
            "board_length": 101.6,
            "board_width": 53.3,
            "microcontroller": "ATmega2560",
            "digital_io_pins": 54,
            "pwm_channels": 15,
            "analog_inputs": 16,
            "flash_memory_kb": 256,
            "clock_speed_mhz": 16,
            "input_voltage_v": 7-12,
            "explode_factor": 0
        },
        "parts": ["fr4_pcb_substrate", "atmega2560_tqfp100", "usb_type_b_receptacle", "dc_barrel_jack", "double_row_digital_headers", "analog_input_headers", "power_headers", "16mhz_crystal", "reset_pushbutton"],
        "features": ["54 digital input/output pins", "16 analog inputs with 10-bit ADC", "4 hardware serial UART ports", "standard Arduino R3 shield compatibility"],
        "standards": ["IPC-7351B", "Arduino Form Factor Spec", "RoHS"]
    }

    scad = """// Arduino Mega 2560 R3 Development Board
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
"""
    return spec, scad, mb.to_binary_stl()


def build_speedybee_2807_motor():
    mb = MeshBuilder()
    # SpeedyBee 2807 1050kV Brushless Drone Motor
    rotor_od = 33.5
    rotor_h = 17.5
    base_od = 32.0

    # Rotor Bell (aluminum casing with cooling spokes)
    mb.add_tube(0, 0, 8.0, rotor_od/2, rotor_od/2 - 1.8, rotor_h, segments=32)
    # Bell top dome
    mb.add_cylinder(0, 0, 8.0 + rotor_h, rotor_od/2, 2.5, segments=32)

    # 4-spoke airflow vents on bell dome
    for i in range(4):
        a = i * math.pi / 2
        mb.add_box(7.0 * math.cos(a) - 2.0, 7.0 * math.sin(a) - 2.0, 8.0 + rotor_h, 4.0, 4.0, 2.8)

    # Motor output shaft (M5 threaded prop shaft)
    mb.add_cylinder(0, 0, 8.0 + rotor_h + 2.5, 2.5, 14.0, segments=20)

    # Internal Stator Core (28mm dia x 7mm height)
    mb.add_cylinder(0, 0, 10.0, 14.0, 7.0, segments=24)

    # Stator wire coils (12N stator teeth)
    for i in range(12):
        a = i * 2 * math.pi / 12
        cx = 10.5 * math.cos(a)
        cy = 10.5 * math.sin(a)
        mb.add_cylinder(cx, cy, 10.0, 2.2, 7.0, segments=12)

    # Stator base mount (19x19mm M3 bolt pattern)
    mb.add_cylinder(0, 0, 0, base_od/2, 4.0, segments=28)
    for bx, by in [(-9.5, -9.5), (-9.5, 9.5), (9.5, -9.5), (9.5, 9.5)]:
        mb.add_cylinder(bx, by, 0, 1.6, 4.0, segments=12)

    spec = {
        "name": "speedybee_2807_motor",
        "title": "SpeedyBee 2807 1050kV Brushless Drone Motor",
        "category": "electrical",
        "type": "mechanical",
        "units": "mm",
        "source_file": "SpeedyBee 2807 1050kV Motor.IGS",
        "dimensions": {"diameter": 33.5, "height": 38.5, "weight_g": 48.0},
        "default_material": "aluminum",
        "parameters": {
            "stator_diameter": 28.0,
            "stator_height": 7.0,
            "kv_rating": 1050,
            "configuration": "12N14P",
            "rotor_outer_diameter": 33.5,
            "shaft_diameter": 5.0,
            "shaft_length": 14.0,
            "mount_hole_pattern": "19x19mm M3",
            "idle_current_a": 1.2,
            "max_power_w": 1350,
            "max_thrust_g": 2450,
            "explode_factor": 0
        },
        "parts": ["cnc_aluminum_bell", "n52h_arc_magnets", "kawasaki_silicon_steel_stator", "oxygen_free_copper_windings", "titanium_alloy_shaft", "nsk_9x4x4_ball_bearings", "m3_base_plate"],
        "features": ["12N14P high-torque multi-pole stator", "curved N52H Neodymium arc magnets", "vented high-airflow bell cooling", "19x19mm standard quadcopter mounting"],
        "standards": ["ISO 286", "IPC-2221", "RoHS"]
    }

    scad = """// SpeedyBee 2807 1050kV Brushless Outrunner Drone Motor
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
"""
    return spec, scad, mb.to_binary_stl()


def main():
    generators = [
        # Mechanical
        ("mechanical", "mg90_servo", build_mg90_servo),
        ("mechanical", "turbojet_engine", build_turbojet_engine),
        ("mechanical", "engine_block_v4", build_engine_block_v4),
        ("mechanical", "sports_car_chassis", build_sports_car_chassis),
        # Electrical
        ("electrical", "raspberry_pi_zero_w", build_raspberry_pi_zero_w),
        ("electrical", "esp32_38pin", build_esp32_38pin),
        ("electrical", "msi_x370_motherboard", build_msi_x370_motherboard),
        ("electrical", "arduino_mega_2560", build_arduino_mega_2560),
        ("electrical", "speedybee_2807_motor", build_speedybee_2807_motor),
    ]

    catalog = {
        "title": "RUN01 CAD Studio Curated Engineering Datasets",
        "description": "High-fidelity parametric mechanical and electrical CAD datasets with real-time 3D rendering and bidirectional AI editing.",
        "datasets": {
            "mechanical": [],
            "electrical": []
        }
    }

    for category, model_id, gen_fn in generators:
        model_dir = os.path.join(DATASET_ROOT, category, model_id)
        os.makedirs(model_dir, exist_ok=True)

        spec, scad, stl_bytes = gen_fn()

        # Write spec.json
        spec_path = os.path.join(model_dir, 'spec.json')
        with open(spec_path, 'w', encoding='utf-8') as f:
            json.dump(spec, f, indent=2)

        # Write model.scad
        scad_path = os.path.join(model_dir, 'model.scad')
        with open(scad_path, 'w', encoding='utf-8') as f:
            f.write(scad)

        # Write model.stl
        stl_path = os.path.join(model_dir, 'model.stl')
        with open(stl_path, 'wb') as f:
            f.write(stl_bytes)

        print(f"Generated {category}/{model_id}: STL size={len(stl_bytes):,} bytes, Triangles={len(stl_bytes)//50}")

        catalog["datasets"][category].append({
            "id": model_id,
            "title": spec["title"],
            "category": category,
            "type": spec["type"],
            "source_file": spec.get("source_file", ""),
            "dimensions": spec["dimensions"],
            "default_material": spec["default_material"],
            "parameters": spec["parameters"],
            "parts_count": len(spec["parts"]),
            "features": spec["features"],
            "standards": spec["standards"],
            "spec_url": f"/static/cad_dataset/{category}/{model_id}/spec.json",
            "scad_url": f"/static/cad_dataset/{category}/{model_id}/model.scad",
            "stl_url": f"/static/cad_dataset/{category}/{model_id}/model.stl",
            "stl_size_bytes": len(stl_bytes)
        })

    # Write master catalog models.json
    catalog_path = os.path.join(DATASET_ROOT, 'models.json')
    with open(catalog_path, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, indent=2)

    print(f"\nMaster catalog written to {catalog_path}")
    print(f"Total Mechanical Models: {len(catalog['datasets']['mechanical'])}")
    print(f"Total Electrical Models: {len(catalog['datasets']['electrical'])}")

if __name__ == '__main__':
    main()
